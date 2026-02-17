# Lyapunov Controller Design for Neuro-Safe Nicotine Cessation v1.0

related_arch_spec: "specs/neuro-safe-nicotine-cessation-architecture-v1.0.md"
owner_did: "bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7"

## 1. State, Input, Output

- x(t): controller state vector
  - [filtered_craving, slow_inflammation_index, fatigue_index, recent_duty, host_budget_margin].
- u(t): control input
  - stimulation amplitude, frequency, pattern parameters, encoded as a duty scalar u_duty ∈ [0,1] and discrete mode index.
- y_crave(t): craving index (0–1) from biomarkers/self-report.
- z(t): safety state = [u_duty, E, M_prot, S_bio, θ, ΔT].

Dynamics:
- x(t+1) = f(x(t), u(t), y_crave(t)).
- z(t+1) = g(z(t), u(t)) via HostBudget model.[file:23]

## 2. Lyapunov Candidate

Define V(x) as:

- V(x) = w₁·(y_crave)² + w₂·(fatigue_index)² + w₃·(inflammation_index)² + w₄·(1 − host_budget_margin)²

where:
- host_budget_margin = max(0, 0.3 − H_host).  
- All weights w_i > 0.

Desired equilibrium x*:
- y_crave ≈ 0 (subjective relief).
- fatigue_index, inflammation_index low.
- host_budget_margin high (far from boundary).[file:23]

Properties:
- V(x) ≥ 0, V(x*) = 0.
- V(x) increases when craving, fatigue, or inflammation grow or margin shrinks.

## 3. Control Law and Safety Set

Safety set:
- S_safe = { (x,z) | z ∈ P_bio, H_host ≤ 0.3 }.[file:23]

At each control step:

1. Compute admissible input set:
   - U_safe(x,z) = { u | z_proj(x,z,u) ∈ P_bio, H_host,proj ≤ 0.3 }.[file:23]

2. If U_safe(x,z) = ∅:
   - Set u = u_shutdown (zero or minimal duty).
   - Raise HostBudgetViolation and log Errority.

3. Else choose u ∈ U_safe that approximately minimizes:
   - ΔV = V( f(x,u,y_crave) ) − V(x)
   - with constraint ΔV ≤ 0 (Lyapunov condition).[file:23]

Craving role:
- y_crave shapes the V term; high craving encourages u values that reduce craving **within** U_safe.
- y_crave cannot expand U_safe or allow leaving S_safe.[file:23]

## 4. Sketch of Lyapunov Stability Argument

Given:
- A compact safety set S_safe forward-invariant under U_safe (by definition of P_bio, HostBudget).[file:23]
- For all (x,z) ∈ S_safe with x ≠ x*, there exists u ∈ U_safe such that ΔV(x,u) < 0.

Then:
- Trajectories remain in S_safe for all t (safety).
- V(x(t)) is non-increasing and converges to a set where ΔV = 0, ideally x* (relief-without-overload).[file:23]

Proof obligations for implementers:
- Provide system-identification models for f and g in the nicotine cohort.
- Numerically or analytically verify existence of U_safe satisfying ΔV ≤ 0 across S_safe.
- Use SOS or CBF/CLF methods where appropriate for formal verification.[file:23]

## 5. Integration with Governance Predicate A_H,C

At runtime:

- Compute A_H,C(x_host,z,x_ecology,K_person,proj):
  - HostAdmissible(H_host) = (H_host ≤ 0.3).
  - BioCompatAdmissible(z).
  - EcoAdmissible(x_ecology).
  - KarmaAdmissible(K_person,proj).[file:28]

- If A_H,C = false:
  - Override controller output to safe shutdown.
  - Log Errority event indicating which predicate failed.[file:24][file:28]

This guarantees no control step can be executed that violates personal biophysical or ecological guardrails, regardless of craving intensity or external incentives.[file:23][file:28]
