-- Neuromorphic policy kernel: hard constraints + soft fear evaluation.

local M = {}

-- Hard constraints: never allowed evolution.
function M.is_evolution_forbidden(ctx)
  -- ctx fields (example):
  -- ctx.regionFearIndex, ctx.ethicalCeilingMaxFearRegion
  -- ctx.deploymentDensity, ctx.globalMaxDensity
  -- ctx.involvesBioBCI, ctx.forbidIrreversibleBio
  -- ctx.tags (table of strings)

  -- 1. If regional fear already above ceiling, forbid any strengthening.
  if ctx.regionFearIndex and ctx.ethicalCeilingMaxFearRegion
      and ctx.regionFearIndex >= ctx.ethicalCeilingMaxFearRegion then
    return true
  end

  -- 2. Ultra-dense zones: forbid strong evolution if density too high.
  if ctx.deploymentDensity and ctx.globalMaxDensity
      and ctx.deploymentDensity > ctx.globalMaxDensity then
    return true
  end

  -- 3. Irreversible bio/BCI coupling forbidden.
  if ctx.forbidIrreversibleBio and ctx.involvesBioBCI then
    return true
  end

  -- 4. Persuasive / exploitative architectures forbidden.
  if ctx.tags then
    for _, t in ipairs(ctx.tags) do
      if t == "addictive_persuasion" or t == "exploitative_profiling" then
        return true
      end
    end
  end

  return false
end

-- Soft evolution: compute fear delta for a proposed change.
function M.evaluate_evolution(ctx)
  -- ctx fields:
  -- ctx.baseFear, ctx.baseEcoFear, ctx.baseDataMisuse
  -- ctx.deltaEnergyPerInference, ctx.deltaThroughput,
  -- ctx.deltaDataSensitivity (0..1), ctx.deltaRoleCriticality (0..1)

  local fear = ctx.baseFear or 0.0
  local eco = ctx.baseEcoFear or 0.0
  local data = ctx.baseDataMisuse or 0.0

  -- Energy / ecology improvement reduces eco-fear.
  if ctx.deltaEnergyPerInference and ctx.deltaEnergyPerInference < 0 then
    eco = math.max(0.0, eco + 0.5 * ctx.deltaEnergyPerInference)
  elseif ctx.deltaEnergyPerInference and ctx.deltaEnergyPerInference > 0 then
    eco = eco + 0.5 * ctx.deltaEnergyPerInference
  end

  -- Increased throughput can mildly raise fear unless eco improves.
  if ctx.deltaThroughput and ctx.deltaThroughput > 0 then
    fear = fear + 0.2 * ctx.deltaThroughput
  end

  -- Data sensitivity directly bumps data-misuse.
  if ctx.deltaDataSensitivity and ctx.deltaDataSensitivity > 0 then
    data = data + 0.7 * ctx.deltaDataSensitivity
  end

  -- Role shifts toward more critical decision layers bump fear.
  if ctx.deltaRoleCriticality and ctx.deltaRoleCriticality > 0 then
    fear = fear + 0.4 * ctx.deltaRoleCriticality
  end

  -- Clamp to [0,1].
  local function clamp01(x)
    if x < 0 then return 0 end
    if x > 1 then return 1 end
    return x
  end

  fear = clamp01(fear)
  eco = clamp01(eco)
  data = clamp01(data)

  return {
    fear = fear,
    ecoFear = eco,
    dataMisuse = data,
  }
end

return M
