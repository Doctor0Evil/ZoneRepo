use crate::{FearIndex, PolicyContext, PolicyEngine};
use mlua::{Lua, Value, Table, Function, Error as LuaError, Result as LuaResult};

pub struct LuaPolicyEngine {
    lua: Lua,
    is_forbidden_fn: Function<'static>,
    eval_transition_fn: Function<'static>,
}

impl LuaPolicyEngine {
    pub fn new(script_source: &str) -> anyhow::Result<Self> {
        let lua = Lua::new();

        // Optional: sandbox for safety.
        lua.sandbox(true)?;

        // Load the script (behaviors.lua contents).
        lua.load(script_source).exec()?;

        let globals = lua.globals();
        let module: Table = globals.get("M").or_else(|_| globals.get("behaviors")).unwrap_or(globals);

        let is_forbidden_fn: Function = module.get("is_transition_forbidden")?;
        let eval_transition_fn: Function = module.get("evaluate_transition")?;

        // Extend lifetime to 'static by leaking. In a real system you’d wrap this more carefully.
        let lua_static: Lua = unsafe { std::mem::transmute::<Lua, Lua>(lua) };
        let is_forbidden_static: Function<'static> = unsafe { std::mem::transmute(is_forbidden_fn) };
        let eval_transition_static: Function<'static> = unsafe { std::mem::transmute(eval_transition_fn) };

        Ok(Self {
            lua: lua_static,
            is_forbidden_fn: is_forbidden_static,
            eval_transition_fn: eval_transition_static,
        })
    }

    fn ctx_to_lua_table<'a>(&self, ctx: &PolicyContext<'a>) -> LuaResult<Table<'static>> {
        let lua = &self.lua;

        lua.context(|lua_ctx| {
            let tbl = lua_ctx.create_table()?;
            tbl.set("agent_id", ctx.agent_id.0)?;
            tbl.set("region_id", ctx.region_id)?;
            tbl.set("concept_key", ctx.concept_key)?;
            tbl.set("proposed_strength", match ctx.proposed_strength {
                crate::BeliefStrength::Weak => "Weak",
                crate::BeliefStrength::Moderate => "Moderate",
                crate::BeliefStrength::Strong => "Strong",
            })?;
            tbl.set("env_time", ctx.env_time)?;
            tbl.set("region_population", ctx.region_population)?;
            tbl.set("concept_intensity", ctx.concept_intensity)?;

            if let Some(b) = ctx.current_belief {
                let b_tbl = lua_ctx.create_table()?;
                b_tbl.set("key", b.key.as_str())?;
                b_tbl.set("strength", match b.strength {
                    crate::BeliefStrength::Weak => "Weak",
                    crate::BeliefStrength::Moderate => "Moderate",
                    crate::BeliefStrength::Strong => "Strong",
                })?;
                tbl.set("current_belief", b_tbl)?;
            else
                tbl.set("current_belief", Value::Nil)?;
            end

            Ok(tbl)
        })
    }
}

impl PolicyEngine for LuaPolicyEngine {
    fn is_transition_forbidden(
        &self,
        ctx: &PolicyContext,
    ) -> bool {
        let lua_ctx_table = match self.ctx_to_lua_table(ctx) {
            Ok(t) => t,
            Err(_) => return true, // fail-closed
        };

        self.lua
            .context(|_lua_ctx| {
                self.is_forbidden_fn
                    .call::<_, bool>(lua_ctx_table)
                    .map_err(|_e| LuaError::RuntimeError("is_transition_forbidden failed".into()))
            })
            .unwrap_or(true) // fail-closed
    }

    fn evaluate_transition(
        &self,
        ctx: &PolicyContext,
    ) -> FearIndex {
        let lua_ctx_table = match self.ctx_to_lua_table(ctx) {
            Ok(t) => t,
            Err(_) => {
                return FearIndex {
                    systemic_harm: 1.0,
                    regret: 1.0,
                    ecological_damage: 1.0,
                }
            }
        };

        let res: LuaResult<Table> = self.lua.context(|_lua_ctx| {
            self.eval_transition_fn
                .call::<_, Table>(lua_ctx_table)
        });

        match res {
            Ok(t) => {
                let systemic_harm: f64 = t.get("systemic_harm").unwrap_or(1.0);
                let regret: f64 = t.get("regret").unwrap_or(1.0);
                let ecological_damage: f64 = t.get("ecological_damage").unwrap_or(1.0);
                FearIndex {
                    systemic_harm,
                    regret,
                    ecological_damage,
                }
            }
            Err(_) => FearIndex {
                systemic_harm: 1.0,
                regret: 1.0,
                ecological_damage: 1.0,
            },
        }
    }
}
