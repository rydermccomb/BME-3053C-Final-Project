import math

# Difficulty settings for easy reference in model
DIFFICULTY_SETTINGS = {
    "Easy": {
        "age": 25,
        "HR_rest": 60.0,
        "tau_HR": 5.0,             # slower heart response (sec)
        "heat_capacity": 0.5,      # higher means slower temp change (relative units)
        "sweat_efficiency": 1.2,   # 20% better cooling
        "sweat_rate_base": 0.8,    # baseline sweat rate factor (lower -> less dehydration)
        "cooling_factor": 1.2,     # environmental cooling factor
        "compensation_factor": 1.2,# stronger BP compensation (e.g., vasoconstriction in dehydration)
        "thresholds": {"HR_frac": 1.00, "MAP": 55, "Temp": 42.5, "Hydration": 0.75},
        "stabilization_time": 20
    },
    "Medium": {
        "age": 30,
        "HR_rest": 70.0,
        "tau_HR": 3.0,             # baseline response
        "heat_capacity": 1.0,
        "sweat_efficiency": 1.0,
        "sweat_rate_base": 1.0,
        "cooling_factor": 1.0,
        "compensation_factor": 1.0,
        "thresholds": {"HR_frac": 0.95, "MAP": 60, "Temp": 42.0, "Hydration": 0.80},
        "stabilization_time": 30
    },
    "Hard": {
        "age": 45,
        "HR_rest": 75.0,
        "tau_HR": 2.0,             # faster changes
        "heat_capacity": 0.8,      # heats up faster
        "sweat_efficiency": 0.8,   # less effective cooling
        "sweat_rate_base": 1.2,    # higher sweat rate -> faster dehydration
        "cooling_factor": 0.8,
        "compensation_factor": 0.8,
        "thresholds": {"HR_frac": 0.95, "MAP": 60, "Temp": 41.0, "Hydration": 0.85},
        "stabilization_time": 45
    }
}

class PatientModel:
    def __init__(self, difficulty="Medium"):
        # Load difficulty parameters
        self.params = DIFFICULTY_SETTINGS[difficulty]
        age = self.params["age"]
        # Max heart rate using Tanaka formula:contentReference[oaicite:24]{index=24}
        self.HR_max = 208.0 - 0.7 * age
        self.HR_rest = self.params["HR_rest"]
        # Initial state
        self.hr = self.HR_rest              # Heart rate (bpm)
        self.map = 90.0                     # Mean arterial pressure (mmHg)
        self.core_temp = 37.0               # Core temp (°C)
        self.hydration = 1.0                # Hydration fraction (1.0 = 100%)
        # Other internal variables
        self.time = 0.0                     # simulation time in seconds
        # For scoring
        self.alive_time = 0.0
        self.stable_time = 0.0

    def update(self, exercise_intensity, ambient_temp, hydration_intake_rate, dt=1.0):
        """Advance the simulation by dt seconds with given inputs.
        exercise_intensity: 0.0 to 1.0 (fraction of maximal effort)
        ambient_temp: external temperature in °C
        hydration_intake_rate: liters per hour fluid intake (if any)
        """
        # 1. Heart Rate dynamics
        # Compute target HR from exercise intensity and heat strain
        target_hr = self.HR_rest + exercise_intensity * (self.HR_max - self.HR_rest)
        # Add temperature-induced HR increase: ~+10 bpm per °C above 37:contentReference[oaicite:25]{index=25}
        if self.core_temp > 37.0:
            target_hr += 10 * (self.core_temp - 37.0)
        # Add dehydration strain: e.g. +5 bpm per 10% volume loss (tunable)
        target_hr += 50 * (1.0 - self.hydration) * 0.1  # (if 1-hyd=0.1 (10% loss), adds 5 bpm)
        # Approach target HR based on time constant tau_HR
        tau = self.params["tau_HR"]
        # Exponential approach: new_hr = current_hr + (target_hr - current_hr) * (dt/tau)
        self.hr += (target_hr - self.hr) * (dt / tau)

        # 2. Core Temperature dynamics
        # Heat production from exercise (simple linear scale)
        # e.g. heavy exercise adds ~0.2 °C per second if no cooling (arbitrary tuning)
        heat_prod = 0.2 * exercise_intensity
        # Cooling from environment (radiation/convection)
        # Proportional to difference (core - ambient), scaled by cooling_factor
        cooling_env = self.params["cooling_factor"] * 0.1 * (self.core_temp - ambient_temp)
        # (If ambient < core, cooling_env is positive (cools body); if ambient > core, this becomes negative (heating))
        # Cooling from sweating (evaporation)
        cooling_sweat = 0.0
        if self.core_temp > 37.0 and self.hydration > 0.0:
            # Sweat more if hotter:
            sweat_factor = self.params["sweat_efficiency"] * 0.1 * (self.core_temp - 37.0)
            cooling_sweat = sweat_factor  # cooling effect
        # Net temperature change
        dT = (heat_prod - cooling_env - cooling_sweat) / self.params["heat_capacity"]
        self.core_temp += dT * dt

        # 3. Hydration dynamics
        # Sweat loss (fluid loss) when core temp > 37 or heavy exercise
        sweat_rate = 0.0
        if self.core_temp > 37.0:
            # Base sweat rate (fraction of body water per second)
            # e.g., 1.0 in params might correspond to ~1% loss per minute at high temp
            sweat_rate = self.params["sweat_rate_base"] * 0.001 * (self.core_temp - 36.5) 
            # Also, more exercise -> more sweat
            sweat_rate += self.params["sweat_rate_base"] * 0.001 * exercise_intensity
        # Reduce hydration by sweat loss
        self.hydration -= sweat_rate * dt
        # Increase hydration by intake (convert L/hour to fraction per second)
        # Assume 1.0 hydration fraction = 42 liters (approx total body water for 70 kg person ~60% body weight)
        liters_per_sec = hydration_intake_rate / 3600.0
        fraction_per_sec = liters_per_sec / 42.0
        self.hydration += fraction_per_sec * dt
        # Clamp hydration between 0 and 1 (no overhydration beyond 100%)
        if self.hydration > 1.0:
            self.hydration = 1.0
        if self.hydration < 0.0:
            self.hydration = 0.0

        # 4. Blood Pressure (MAP) dynamics
        # Compute stroke volume relative to full hydration (simple linear relation)
        # Assume stroke volume at rest is such that HR_rest * SV_rest yields baseline CO.
        hydration_factor = self.hydration  # fraction of blood volume
        # Cardiac output relative to rest
        CO = self.hr * hydration_factor  # (since at rest HR_rest*1.0 gives base output)
        # Systemic vascular resistance relative to rest
        # Base SVR influenced by exercise and temp (vasodilation) and dehydration (vasoconstriction)
        intensity_effect = 0.5 * exercise_intensity   # 0.5 drop at max exercise
        temp_effect = 0.2 * max(0, self.core_temp - 37.0)  # 0.2 drop per °C above normal
        dehydr_effect = 0.5 * (1.0 - self.hydration)  # 0.5 increase at 0% hydration (full vasoconstriction)
        SVR_rel = 1.0 - intensity_effect - temp_effect + dehydr_effect
        # Allow compensation_factor to adjust how strongly body compensates (e.g., in hard mode, comp_factor < 1 makes vasoconstriction less effective)
        SVR_rel *= self.params["compensation_factor"]
        # clamp SVR (not below 0.2 relative, not above e.g. 2.0)
        SVR_rel = min(max(SVR_rel, 0.2), 2.0)
        # Compute MAP relative to baseline (assuming baseline MAP 90 mmHg when HR=HR_rest, SVR_rel=1)
        baseline_MAP = 90.0
        baseline_CO = self.HR_rest  # since stroke volume normalized to 1 at full hydration
        self.map = baseline_MAP * (CO / baseline_CO) * SVR_rel

        # Increment time and alive time
        self.time += dt
        self.alive_time += dt

    def check_crash(self):
        """Check if any vital has crossed crash threshold. Returns a tuple (crashed, reason_str)."""
        thr = self.params["thresholds"]
        # Heart rate threshold (fraction of HR_max)
        if self.hr > thr["HR_frac"] * self.HR_max:
            return True, "Heart rate exceeded {:.0f}% of max!".format(thr["HR_frac"]*100)
        # MAP threshold
        if self.map < thr["MAP"]:
            return True, "Mean arterial pressure fell below {} mmHg!".format(thr["MAP"])
        # Core temp threshold
        if self.core_temp > thr["Temp"]:
            return True, "Core temperature exceeded {} °C (heat stroke)!".format(thr["Temp"])
        if self.core_temp < 33.0:  # generic hypothermia threshold
            return True, "Core temperature below 33 °C (severe hypothermia)!"
        # Hydration threshold
        if self.hydration < thr["Hydration"]:
            return True, "Hydration fell below {}%!".format(thr["Hydration"]*100)
        return False, ""

    def in_safe_range(self):
        """Check if vitals are within a 'safe' range (for stabilization condition)."""
        # Define safe ranges somewhat stricter than crash thresholds
        if self.hr > 0.85 * self.HR_max or self.hr < 50:
            return False
        if self.map < 70 or self.map > 120:
            return False
        if self.core_temp < 36.0 or self.core_temp > 38.5:
            return False
        if self.hydration < 0.90:
            return False
        return True
