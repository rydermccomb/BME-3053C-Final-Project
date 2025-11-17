import math

# Difficulty settings
DIFFICULTY_SETTINGS = {
    "Easy": {
        "age": 25,
        "HR_rest": 60.0,
        "tau_HR": 5.0,
        "heat_capacity": 0.5,
        "sweat_efficiency": 1.2,
        "sweat_rate_base": 0.8,
        "cooling_factor": 1.2,
        "compensation_factor": 1.2,
        "thresholds": {"HR_frac": 1.00, "MAP": 55, "Temp": 42.5, "Hydration": 0.75},
        "stabilization_time": 20
    },
    "Medium": {
        "age": 30,
        "HR_rest": 70.0,
        "tau_HR": 3.0,
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
        "tau_HR": 2.0,
        "heat_capacity": 0.8,
        "sweat_efficiency": 0.8,
        "sweat_rate_base": 1.2,
        "cooling_factor": 0.8,
        "compensation_factor": 0.8,
        "thresholds": {"HR_frac": 0.95, "MAP": 60, "Temp": 41.0, "Hydration": 0.85},
        "stabilization_time": 45
    }
}

class PatientModel:
    def __init__(self, difficulty="Medium"):
        self.params = DIFFICULTY_SETTINGS[difficulty]
        age = self.params["age"]
        self.HR_max = 208.0 - 0.7 * age
        self.HR_rest = self.params["HR_rest"]
        self.hr = self.HR_rest
        self.map = 90.0
        self.core_temp = 37.0
        self.hydration = 1.0
        self.time = 0.0
        self.alive_time = 0.0

    def update(self, exercise_intensity, ambient_temp, hydration_intake_rate, dt=1.0):
        # Heart Rate
        target_hr = self.HR_rest + exercise_intensity * (self.HR_max - self.HR_rest)
        if self.core_temp > 37.0:
            target_hr += 10 * (self.core_temp - 37.0)
        target_hr += 50 * (1.0 - self.hydration) * 0.1
        tau = self.params["tau_HR"]
        self.hr += (target_hr - self.hr) * (dt / tau)

        # Core Temperature
        heat_prod = 0.2 * exercise_intensity
        cooling_env = self.params["cooling_factor"] * 0.1 * (self.core_temp - ambient_temp)
        cooling_sweat = 0.0
        if self.core_temp > 37.0 and self.hydration > 0.0:
            sweat_factor = self.params["sweat_efficiency"] * 0.1 * (self.core_temp - 37.0)
            cooling_sweat = sweat_factor
        dT = (heat_prod - cooling_env - cooling_sweat) / self.params["heat_capacity"]
        self.core_temp += dT * dt

        # Hydration
        sweat_rate = 0.0
        if self.core_temp > 37.0:
            sweat_rate = self.params["sweat_rate_base"] * 0.001 * (self.core_temp - 36.5)
            sweat_rate += self.params["sweat_rate_base"] * 0.001 * exercise_intensity
        self.hydration -= sweat_rate * dt
        liters_per_sec = hydration_intake_rate / 3600.0
        fraction_per_sec = liters_per_sec / 42.0
        self.hydration += fraction_per_sec * dt
        self.hydration = max(0.0, min(1.0, self.hydration))

        # Blood Pressure (MAP)
        hydration_factor = self.hydration
        CO = self.hr * hydration_factor
        intensity_effect = 0.5 * exercise_intensity
        temp_effect = 0.2 * max(0, self.core_temp - 37.0)
        dehydr_effect = 0.5 * (1.0 - self.hydration)
        SVR_rel = 1.0 - intensity_effect - temp_effect + dehydr_effect
        SVR_rel *= self.params["compensation_factor"]
        SVR_rel = min(max(SVR_rel, 0.2), 2.0)
        baseline_MAP = 90.0
        baseline_CO = self.HR_rest
        self.map = baseline_MAP * (CO / baseline_CO) * SVR_rel

        self.time += dt
        self.alive_time += dt

    def check_crash(self):
        thr = self.params["thresholds"]
        if self.hr > thr["HR_frac"] * self.HR_max:
            return True, f"Heart rate exceeded {thr['HR_frac']*100:.0f}% of max!"
        if self.map < thr["MAP"]:
            return True, f"Mean arterial pressure fell below {thr['MAP']} mmHg!"
        if self.core_temp > thr["Temp"]:
            return True, f"Core temperature exceeded {thr['Temp']} °C (heat stroke)!"
        if self.core_temp < 33.0:
            return True, "Core temperature below 33 °C (severe hypothermia)!"
        if self.hydration < thr["Hydration"]:
            return True, f"Hydration fell below {thr['Hydration']*100:.0f}%!"
        return False, ""

    def in_safe_range(self):
        if self.hr > 0.85 * self.HR_max or self.hr < 50:
            return False
        if self.map < 70 or self.map > 120:
            return False
        if self.core_temp < 36.0 or self.core_temp > 38.5:
            return False
        if self.hydration < 0.90:
            return False
        return True