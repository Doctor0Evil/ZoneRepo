-- Fear-indexed policy kernel for neuromorphic evolutions
local M = {}

local function clamp01(x)
    if x < 0 then return 0 end
    if x > 1 then return 1 end
    return x
end

local function base_fear_for_evolution(ctx)
    local components = {ecology = 0.0, systemic_harm = 0.0, regret = 0.0}
    if ctx.learning_rules and ctx.learning_rules:find("gradient-based") then
        components.regret = 0.4  -- High irreversibility risk
    end
    if ctx.hardware_profile:find("FPGA") then
        components.ecology = 0.3  -- Energy draw
    end
    local value = clamp01(0.4 * components.ecology + 0.4 * components.systemic_harm + 0.2 * components.regret)
    return {value = value, components = components}
end

function M.evolution_allowed(ctx, gov)
    local fear = base_fear_for_evolution(ctx)
    -- Bump if near ceiling (ZoneRepo symmetry[ file:4])
    local global_ceiling = gov.ethical_ceilings.fear_global_max or 0.6
    if fear.value > global_ceiling * 0.8 then
        fear.value = clamp01(fear.value + 0.1)
    end
    -- Never-allowed: RoH/BCI > 0.3
    if fear.components.regret > 0.7 and fear.components.ecology > 0.4 then
        fear.value = 1.0
    end
    local allow = fear.value <= global_ceiling
    return allow, fear
end

return M
