-- Lua side receives a plain table "ctx" that mirrors PolicyContext from Rust:
-- ctx = {
--   agent_id = <number>,
--   region_id = <string>,
--   concept_key = <string>,
--   current_belief = { key = <string>, strength = "Weak|Moderate|Strong" } or nil,
--   proposed_strength = "Weak|Moderate|Strong",
--   env_time = <number>,
--   region_population = <number>,
--   concept_intensity = <number>,
-- }

local M = {}

-- Example: dynamic region-level overrides, e.g. neighborhoods that are
-- already saturated or ecologically fragile.
local region_overrides = {
  neighborhood_A = {
    max_overload_score = 0.8,
  },
  wetland_protected = {
    max_overload_score = 0.3,
  },
}

-- Computes whether a transition should be hard-forbidden.
function M.is_transition_forbidden(ctx)
  local region_cfg = region_overrides[ctx.region_id]

  -- Base overload score combines concept intensity and normalized population.
  local overload_score = ctx.concept_intensity * (ctx.region_population / 10000.0)

  if region_cfg and overload_score > region_cfg.max_overload_score then
    return true
  end

  -- Optional additional rule: forbid sudden jump to Strong belief in one step
  -- if there was no prior belief and intensity is low.
  if ctx.current_belief == nil
     and ctx.proposed_strength == "Strong"
     and ctx.concept_intensity < 0.6 then
    return true
  end

  return false
end

-- Computes a Lua-side fear index contribution; Rust can blend this
-- with its native FearIndex.
function M.evaluate_transition(ctx)
  local systemic_harm = ctx.concept_intensity * 0.4
  local regret

  if ctx.proposed_strength == "Strong" then
    regret = 0.5
  elseif ctx.proposed_strength == "Moderate" then
    regret = 0.25
  else
    regret = 0.1
  end

  local ecological_damage = (ctx.region_population / 1_000_000.0) * 0.4

  return {
    systemic_harm = systemic_harm,
    regret = regret,
    ecological_damage = ecological_damage,
  }
end

-- Optional hook: tweak concept intensity per tick, e.g. decay or amplification
-- based on local saturation or fatigue.
function M.update_concept_field(concept_key, region_id, current_intensity, env_time)
  if concept_key ~= "new_concept" then
    return current_intensity
  end

  -- Simple decay after a certain time, to model fading hype.
  if env_time > 100.0 then
    return current_intensity * 0.995
  end

  -- Slight amplification early on in densely populated areas.
  if current_intensity < 0.5 then
    return current_intensity + 0.001
  end

  return current_intensity
end

return M
