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
  neighborhood_A = { max_overload_score = 0.8 },
  wetland_protected = { max_overload_score = 0.3 },
}

-- ---------- Policy: forbid / fear evaluation ----------

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

  local ecological_damage = (ctx.region_population / 1000000.0) * 0.4

  return {
    systemic_harm = systemic_harm,
    regret = regret,
    ecological_damage = ecological_damage,
  }
end

-- ---------- Concept field update ----------

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

  -- Slight amplification early on.
  if current_intensity < 0.5 then
    return current_intensity + 0.001
  end

  return current_intensity
end

-- ---------- Movement patterns: commuting, events, protests ----------

-- These are high-level movement hooks. Rust passes a simple table
-- describing the agent and we return an updated location table.

-- Example data structure for `agent`:
-- {
--   id = <number>,
--   x = <number>,
--   y = <number>,
--   region_id = <string>,
--   home_region_id = <string>,
--   work_region_id = <string>,
--   belief_new_concept = "Weak|Moderate|Strong" or nil,
-- }

-- Commuting pattern: move between home and work regions based on time of day.
function M.compute_commute_location(agent, env_time)
  local hour = env_time % 24.0
  local target_region_id = agent.region_id

  if hour >= 8.0 and hour <= 10.0 then
    target_region_id = agent.work_region_id or agent.region_id
  elseif hour >= 17.0 and hour <= 19.0 then
    target_region_id = agent.home_region_id or agent.region_id
  end

  -- Very simple: jump to target region, keep coordinates unchanged.
  return {
    x = agent.x,
    y = agent.y,
    region_id = target_region_id,
  }
end

-- Event participation: cluster agents near an event hotspot if they
-- have at least Moderate belief in the concept.
function M.compute_event_location(agent, env_time, event)
  -- event = { region_id = <string>, x = <number>, y = <number>, start = <number>, stop = <number> }

  if env_time < event.start or env_time > event.stop then
    return nil -- no change
  end

  local belief = agent.belief_new_concept

  if belief == "Moderate" or belief == "Strong" then
    return {
      x = event.x,
      y = event.y,
      region_id = event.region_id,
    }
  end

  return nil
end

-- Protest / counter-protest: move strongly aligned agents into or away
-- from protest centers depending on alignment_flag.
function M.compute_protest_location(agent, env_time, protest)
  -- protest = {
  --   region_id = <string>,
  --   x = <number>,
  --   y = <number>,
  --   start = <number>,
  --   stop = <number>,
  --   alignment_flag = "for"|"against"
  -- }

  if env_time < protest.start or env_time > protest.stop then
    return nil
  end

  local belief = agent.belief_new_concept

  if belief ~= "Strong" then
    return nil
  end

  local target_x, target_y = protest.x, protest.y

  if protest.alignment_flag == "against" then
    -- Move away from protest center (simple radial offset).
    target_x = protest.x + 5.0
    target_y = protest.y + 5.0
  end

  return {
    x = target_x,
    y = target_y,
    region_id = protest.region_id,
  }
end

return M
