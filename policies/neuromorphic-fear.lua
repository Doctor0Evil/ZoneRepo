-- Fear-index kernel for neuromorphic node classes.
-- Mirrors ZoneRepo / Cargo fear semantics (soft score + hard ceilings),
-- but runs at node level.

local M = {}

local function clamp01(x)
  if x < 0 then return 0 end
  if x > 1 then return 1 end
  return x
end

-- Base components from nodeClass and telemetry flags.
local function base_fear_for_node(node_class, telemetry_flags)
  local components = {
    ecology = 0.0,
    systemicharm = 0.0,
    regret = 0.0,
    bci = 0.0,
  }

  if node_class == "loihi-sim" then
    components.systemicharm = 0.2
  elseif node_class == "fpga-bci-adjacent" then
    components.systemicharm = 0.5
    components.bci = 0.5
  elseif node_class:find("bci") then
    components.systemicharm = 0.7
    components.bci = 0.8
  end

  if telemetry_flags["high_error_rate"] and telemetry_flags["high_error_rate"] > 0.3 then
    components.systemicharm = components.systemicharm + 0.2
  end
  if telemetry_flags["thermal_hotspot"] and telemetry_flags["thermal_hotspot"] > 0.3 then
    components.ecology = components.ecology + 0.3
  end

  local value = clamp01(
    0.4 * components.ecology +
    0.4 * components.systemicharm +
    0.2 * components.regret
  )

  return { value = value, components = components }
end

local function bump_for_context(fear, ceilings, bci_coupling)
  local max_node = ceilings.max_fear_index_node or 0.3
  local hardcap = ceilings.hardcap or 0.9
  local value = fear.value
  local comp = fear.components

  -- Raise fear when near ceiling
  if value > max_node * 0.8 then
    value = clamp01(value + 0.1)
  end

  -- Never-allowed region: BCI coupling over 0.3 + eco + systemic high.
  if bci_coupling and bci_coupling > 0.3 and comp.ecology > 0.3 and comp.systemicharm > 0.3 then
    value = 1.0
  end

  -- Hard cap: anything at hardcap is effectively forbidden.
  if value >= hardcap then
    value = 1.0
  end

  fear.value = value
  return fear
end

local function decision_from_fear(fear, ceilings, eco_fear_node)
  local max_node = ceilings.max_fear_index_node or 0.3
  local max_eco = ceilings.max_eco_damage_node or 0.3

  if eco_fear_node and eco_fear_node > max_eco then
    return false, fear, "ecoFearNode exceeds ceiling"
  end

  if fear.value >= 1.0 then
    return false, fear, "fear index in never-allowed region"
  end

  if fear.value > max_node then
    return false, fear, "fear index exceeds node ceiling"
  end

  return true, fear, "within node ceiling"
end

-- ctx: { nodeClass, telemetryFlags, bciCoupling, ecoFearNode, ceilings = { ... } }
function M.evaluate_node(ctx)
  local base = base_fear_for_node(ctx.nodeClass, ctx.telemetryFlags or {})
  local fear = bump_for_context(base, ctx.ceilings or {}, ctx.bciCoupling or 0.0)
  local allowed, fear_out, reason = decision_from_fear(
    fear,
    ctx.ceilings or {},
    ctx.ecoFearNode or 0.0
  )

  return {
    allowed = allowed,
    fearIndexNode = fear_out.value,
    components = fear_out.components,
    reason = reason,
  }
end

return M
