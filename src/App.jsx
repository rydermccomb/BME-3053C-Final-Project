// ============================================================================
// PHYSIOLOGY STABILIZER GAME - App.jsx
// ============================================================================
// A real-time physiological simulation game where players manage patient
// vital signs through exercise, temperature, and hydration interventions.
// Built with React, Recharts, and Lucide icons.
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Heart, Thermometer, Droplets, Activity, Play, Pause, RotateCcw, Trophy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ============================================================================
// DIFFICULTY SETTINGS
// ============================================================================
// Each difficulty level has different patient parameters and thresholds.
// Easy: Younger patient (25yo), more forgiving thresholds, slower changes
// Medium: Middle-aged patient (30yo), balanced parameters
// Hard: Older patient (45yo), stricter thresholds, faster changes
// ============================================================================

const DIFFICULTY_SETTINGS = {
  Easy: {
    age: 25,                          // Patient age in years
    HR_rest: 60.0,                    // Resting heart rate (bpm)
    tau_HR: 5.0,                      // Time constant for HR changes - higher = slower
    heat_capacity: 0.5,               // Thermal inertia - lower = heats up faster
    sweat_efficiency: 1.2,            // Cooling effectiveness (1.2 = 20% better)
    sweat_rate_base: 0.8,             // Base sweat rate multiplier
    cooling_factor: 1.2,              // Environmental cooling effectiveness
    compensation_factor: 1.2,         // Cardiovascular compensation strength
    thresholds: {                     // Crash thresholds (game over if exceeded)
      HR_frac: 1.00,                  // Max HR as fraction of age-predicted max
      MAP: 55,                        // Minimum mean arterial pressure (mmHg)
      Temp: 42.5,                     // Maximum core temperature (°C)
      Hydration: 0.75                 // Minimum hydration level (fraction)
    },
    stabilization_time: 15            // Seconds needed in safe range to win
  },
  Medium: {
    age: 30,
    HR_rest: 70.0,
    tau_HR: 3.0,
    heat_capacity: 1.0,
    sweat_efficiency: 1.0,
    sweat_rate_base: 1.0,
    cooling_factor: 1.0,
    compensation_factor: 1.0,
    thresholds: {
      HR_frac: 0.95,
      MAP: 60,
      Temp: 42.0,
      Hydration: 0.80
    },
    stabilization_time: 20
  },
  Hard: {
    age: 45,
    HR_rest: 75.0,
    tau_HR: 2.0,
    heat_capacity: 0.8,
    sweat_efficiency: 0.8,
    sweat_rate_base: 1.2,
    cooling_factor: 0.8,
    compensation_factor: 0.8,
    thresholds: {
      HR_frac: 0.95,
      MAP: 60,
      Temp: 41.0,
      Hydration: 0.85
    },
    stabilization_time: 30
  }
};

// ============================================================================
// PATIENT MODEL CLASS
// ============================================================================
// This class simulates human physiology using differential equations.
// It models the cardiovascular system, thermoregulation, and fluid balance.
// ============================================================================

class PatientModel {
  constructor(difficulty = "Medium") {
    // Load difficulty-specific parameters
    this.params = DIFFICULTY_SETTINGS[difficulty];
    const age = this.params.age;
    
    // Calculate maximum heart rate using Tanaka formula:
    // HR_max = 208 - (0.7 × age)
    // This is the age-predicted maximum safe heart rate
    this.HR_max = 208.0 - 0.7 * age;
    this.HR_rest = this.params.HR_rest;
    
    // Initialize vital signs at normal resting values
    this.hr = this.HR_rest;              // Heart rate (beats per minute)
    this.map = 90.0;                     // Mean arterial pressure (mmHg)
    this.core_temp = 37.0;               // Core body temperature (°C)
    this.hydration = 1.0;                // Hydration (1.0 = 100% = fully hydrated)
    
    // Time tracking
    this.time = 0.0;                     // Total simulation time (seconds)
    this.alive_time = 0.0;               // Time patient has been alive (for scoring)
  }

  // ==========================================================================
  // UPDATE METHOD - Main simulation engine
  // ==========================================================================
  // This runs every 0.5 seconds (dt) and updates all vital signs based on:
  // - exercise_intensity: 0.0 to 1.0 (0% to 100% effort)
  // - ambient_temp: Environmental temperature in Celsius
  // - hydration_intake_rate: Fluid intake in liters per hour
  // ==========================================================================
  
  update(exercise_intensity, ambient_temp, hydration_intake_rate, dt = 1.0) {
    
    // ----------------------------------------------------------------------
    // 1. HEART RATE DYNAMICS
    // ----------------------------------------------------------------------
    // Heart rate responds to: exercise, heat stress, and dehydration
    
    // Base target HR from exercise (linear interpolation between rest and max)
    let target_hr = this.HR_rest + exercise_intensity * (this.HR_max - this.HR_rest);
    
    // Add temperature effect: +10 bpm per degree above 37°C (thermal stress)
    if (this.core_temp > 37.0) {
      target_hr += 10 * (this.core_temp - 37.0);
    }
    
    // Add dehydration effect: Blood volume loss increases HR
    // For every 10% dehydration (0.1 drop), add approximately 5 bpm
    target_hr += 50 * (1.0 - this.hydration) * 0.1;
    
    // Approach target HR using exponential decay with time constant tau
    // This creates realistic gradual changes rather than instant jumps
    const tau = this.params.tau_HR;
    this.hr += (target_hr - this.hr) * (dt / tau);

    // ----------------------------------------------------------------------
    // 2. CORE TEMPERATURE DYNAMICS
    // ----------------------------------------------------------------------
    // Temperature changes from: heat production, environmental cooling, sweating
    
    // Heat production from exercise (metabolic heat)
    // High exercise = more muscle activity = more heat generation
    const heat_prod = 0.2 * exercise_intensity;
    
    // Environmental cooling via convection and radiation
    // Proportional to temperature difference (Newton's law of cooling)
    const cooling_env = this.params.cooling_factor * 0.1 * (this.core_temp - ambient_temp);
    
    // Evaporative cooling from sweating
    let cooling_sweat = 0.0;
    if (this.core_temp > 37.0 && this.hydration > 0.0) {
      // More sweating when hotter (proportional to temperature above normal)
      const sweat_factor = this.params.sweat_efficiency * 0.1 * (this.core_temp - 37.0);
      cooling_sweat = sweat_factor;
    }
    
    // Net temperature change (energy balance equation)
    // dT/dt = (heat_in - heat_out) / heat_capacity
    const dT = (heat_prod - cooling_env - cooling_sweat) / this.params.heat_capacity;
    this.core_temp += dT * dt;

    // ----------------------------------------------------------------------
    // 3. HYDRATION DYNAMICS
    // ----------------------------------------------------------------------
    // Fluid balance: loss through sweating, gain through drinking
    
    // Calculate sweat rate (fluid loss)
    let sweat_rate = 0.0;
    if (this.core_temp > 37.0) {
      // Base sweat rate increases with temperature
      sweat_rate = this.params.sweat_rate_base * 0.001 * (this.core_temp - 36.5);
      // Additional sweating from exercise
      sweat_rate += this.params.sweat_rate_base * 0.001 * exercise_intensity;
    }
    
    // Decrease hydration from sweating
    this.hydration -= sweat_rate * dt;
    
    // Increase hydration from fluid intake
    // Convert L/hour to fraction per second
    // Assuming 42L total body water for 70kg person (60% body weight)
    const liters_per_sec = hydration_intake_rate / 3600.0;
    const fraction_per_sec = liters_per_sec / 42.0;
    this.hydration += fraction_per_sec * dt;
    
    // Clamp hydration between 0 and 1 (cannot go below 0% or above 100%)
    this.hydration = Math.max(0, Math.min(1, this.hydration));

    // ----------------------------------------------------------------------
    // 4. BLOOD PRESSURE (MAP) DYNAMICS
    // ----------------------------------------------------------------------
    // MAP determined by cardiac output (CO) and systemic vascular resistance (SVR)
    // MAP = CO × SVR (Ohm's law applied to circulation)
    
    // Cardiac output proportional to HR and blood volume (hydration)
    const hydration_factor = this.hydration;  // Lower hydration = lower stroke volume
    const CO = this.hr * hydration_factor;
    
    // Calculate vascular resistance changes
    const intensity_effect = 0.5 * exercise_intensity;  // Exercise causes vasodilation
    const temp_effect = 0.2 * Math.max(0, this.core_temp - 37.0);  // Heat causes vasodilation
    const dehydr_effect = 0.5 * (1.0 - this.hydration);  // Dehydration causes vasoconstriction
    
    // Net SVR relative to baseline (1.0 = normal resistance)
    let SVR_rel = 1.0 - intensity_effect - temp_effect + dehydr_effect;
    SVR_rel *= this.params.compensation_factor;  // Difficulty adjusts compensation strength
    SVR_rel = Math.min(Math.max(SVR_rel, 0.2), 2.0);  // Clamp to reasonable physiological range
    
    // Calculate MAP from baseline values
    const baseline_MAP = 90.0;
    const baseline_CO = this.HR_rest;
    this.map = baseline_MAP * (CO / baseline_CO) * SVR_rel;

    // Update time counters
    this.time += dt;
    this.alive_time += dt;
  }

  // ==========================================================================
  // CHECK_CRASH METHOD
  // ==========================================================================
  // Checks if any vital sign has crossed a critical threshold (game over)
  // Returns [crashed (boolean), reason (string)]
  // ==========================================================================
  
  check_crash() {
    const thr = this.params.thresholds;
    
    // Check heart rate (tachycardia - dangerously high heart rate)
    if (this.hr > thr.HR_frac * this.HR_max) {
      return [true, `Heart rate exceeded ${(thr.HR_frac * 100).toFixed(0)}% of max!`];
    }
    
    // Check blood pressure (hypotension - dangerously low blood pressure)
    if (this.map < thr.MAP) {
      return [true, `Mean arterial pressure fell below ${thr.MAP} mmHg!`];
    }
    
    // Check core temperature (hyperthermia - heat stroke)
    if (this.core_temp > thr.Temp) {
      return [true, `Core temperature exceeded ${thr.Temp} °C (heat stroke)!`];
    }
    
    // Check core temperature (hypothermia - dangerously cold)
    if (this.core_temp < 33.0) {
      return [true, "Core temperature below 33 °C (severe hypothermia)!"];
    }
    
    // Check hydration (severe dehydration)
    if (this.hydration < thr.Hydration) {
      return [true, `Hydration fell below ${(thr.Hydration * 100).toFixed(0)}%!`];
    }
    
    return [false, ""];  // No crash, patient is still alive
  }

  // ==========================================================================
  // IN_SAFE_RANGE METHOD
  // ==========================================================================
  // Checks if ALL vitals are within "safe" ranges (for winning condition)
  // These ranges are stricter than crash thresholds but are achievable
  // All vitals must be in safe range simultaneously to win
  // ==========================================================================
  
  in_safe_range() {
    // Heart rate: between 45-90% of max (relaxed from 85% for playability)
    if (this.hr > 0.90 * this.HR_max || this.hr < 45) return false;
    
    // Blood pressure: between 65-130 mmHg (relaxed from 70 minimum)
    if (this.map < 65 || this.map > 130) return false;
    
    // Core temperature: between 35.5-39.0°C (relaxed upper limit)
    if (this.core_temp < 35.5 || this.core_temp > 39.0) return false;
    
    // Hydration: above 85% (relaxed from 90% for playability)
    if (this.hydration < 0.85) return false;
    
    return true;  // All vitals are in safe range
  }
}

// ============================================================================
// MAIN GAME COMPONENT
// ============================================================================
// This is the React component that renders the UI and manages game state
// ============================================================================

export default function PhysiologyGame() {
  
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  // React hooks to track game state, user inputs, and simulation data
  
  // User control inputs
  const [difficulty, setDifficulty] = useState("Medium");
  const [exercise, setExercise] = useState(0);           // 0-100%
  const [ambientTemp, setAmbientTemp] = useState(25);    // 0-50°C
  const [hydrationRate, setHydrationRate] = useState(0); // 0-2 L/hr
  
  // Game state tracking
  const [running, setRunning] = useState(false);         // Is simulation running?
  const [gameState, setGameState] = useState("idle");    // idle/running/crashed/won
  const [crashReason, setCrashReason] = useState("");    // Why did patient crash?
  const [score, setScore] = useState(0);                 // Final score
  const [stableTimer, setStableTimer] = useState(0);     // Time in safe range (seconds)
  
  // Persistent references (survive re-renders without causing re-renders)
  const modelRef = useRef(new PatientModel(difficulty)); // The patient model instance
  const [history, setHistory] = useState([]);            // Historical data for graphs
  const intervalRef = useRef(null);                      // Interval timer reference

  // --------------------------------------------------------------------------
  // EFFECT: Reset game when difficulty changes
  // --------------------------------------------------------------------------
  // When user selects a new difficulty, create a new patient model
  // and reset all game state to starting conditions
  useEffect(() => {
    modelRef.current = new PatientModel(difficulty);
    setHistory([]);
    setStableTimer(0);
    setGameState("idle");
    setCrashReason("");
    setScore(0);
  }, [difficulty]);

  // --------------------------------------------------------------------------
  // EFFECT: Main simulation loop
  // --------------------------------------------------------------------------
  // Runs every 500ms when game is running
  // Updates model, checks conditions, and manages game state
  useEffect(() => {
    if (running && gameState === "running") {
      intervalRef.current = setInterval(() => {
        const model = modelRef.current;
        const exercise_frac = exercise / 100.0;  // Convert percentage to fraction
        
        // Update the physiological model with current inputs
        model.update(exercise_frac, ambientTemp, hydrationRate, 0.5);
        
        // Check if patient has crashed (vital sign exceeded threshold)
        const [crashed, reason] = model.check_crash();
        
        // Add current state to history for graphing
        // Keep only last 100 points to prevent memory issues
        setHistory(prev => [...prev.slice(-100), {
          time: model.time,
          HR: model.hr,
          MAP: model.map,
          Temp: model.core_temp,
          Hydration: model.hydration * 100
        }]);

        // Handle crash condition - patient died
        if (crashed) {
          setRunning(false);
          setGameState("crashed");
          setCrashReason(reason);
          clearInterval(intervalRef.current);
          return;
        }

        // Update stability timer for win condition
        if (model.in_safe_range()) {
          setStableTimer(prev => prev + 0.5);  // Increment by 0.5s (interval duration)
        } else {
          setStableTimer(0);  // Reset timer if patient leaves safe range
        }

        // Check win condition - patient stable for required time
        if (stableTimer >= model.params.stabilization_time) {
          setRunning(false);
          setGameState("won");
          
          // Calculate score: (survival + bonus) × difficulty multiplier
          const diffMult = difficulty === "Easy" ? 1.0 : difficulty === "Medium" ? 1.5 : 2.0;
          const finalScore = Math.floor((model.alive_time + model.alive_time * 0.5) * diffMult);
          setScore(finalScore);
          clearInterval(intervalRef.current);
        }
      }, 500);  // Run every 500ms (0.5 seconds)

      // Cleanup function: clear interval when effect unmounts or dependencies change
      return () => clearInterval(intervalRef.current);
    }
  }, [running, gameState, exercise, ambientTemp, hydrationRate, stableTimer, difficulty]);

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------
  
  // Handle start/pause/resume button
  const handleStart = () => {
    if (gameState === "idle") {
      setGameState("running");
      setRunning(true);
    } else {
      setRunning(!running);  // Toggle between pause and resume
    }
  };

  // Handle reset button - return everything to initial state
  const handleReset = () => {
    setRunning(false);
    clearInterval(intervalRef.current);
    modelRef.current = new PatientModel(difficulty);
    setHistory([]);
    setStableTimer(0);
    setGameState("idle");
    setCrashReason("");
    setScore(0);
    setExercise(0);
    setAmbientTemp(25);
    setHydrationRate(0);
  };

  // Get current model and parameters for rendering
  const model = modelRef.current;
  const params = DIFFICULTY_SETTINGS[difficulty];

  // --------------------------------------------------------------------------
  // RENDER UI
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <h1 className="text-4xl font-bold text-indigo-900 mb-2 flex items-center gap-3">
            <Heart className="text-red-500" size={40} />
            Physiology Stabilizer Game
          </h1>
          <p className="text-gray-600">
            Keep the patient vitals stable by adjusting exercise, environment, and hydration. Survive and stabilize to win!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          
          {/* Left Sidebar - Control Panel */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-indigo-900">Controls</h2>
            
            {/* Difficulty Selector */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Difficulty</label>
              <select 
                value={difficulty} 
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={gameState !== "idle"}
                className="w-full p-2 border rounded"
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Patient age: {params.age} years</p>
            </div>

            {/* Exercise Intensity Slider */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">
                Exercise Intensity: {exercise}%
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={exercise}
                onChange={(e) => setExercise(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Ambient Temperature Slider */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">
                Ambient Temp: {ambientTemp}°C
              </label>
              <input 
                type="range" 
                min="0" 
                max="50" 
                step="1"
                value={ambientTemp}
                onChange={(e) => setAmbientTemp(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Hydration Intake Slider */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">
                Hydration: {hydrationRate.toFixed(1)} L/hr
              </label>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.1"
                value={hydrationRate}
                onChange={(e) => setHydrationRate(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Control Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleStart}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700"
              >
                {running ? <Pause size={20} /> : <Play size={20} />}
                {running ? "Pause" : gameState === "idle" ? "Start" : "Resume"}
              </button>
              <button
                onClick={handleReset}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-gray-700"
              >
                <RotateCcw size={20} />
                Reset
              </button>
            </div>

            {/* Game State Messages */}
            
            {/* Crashed State */}
            {gameState === "crashed" && (
              <div className="mt-4 bg-red-100 border-l-4 border-red-500 p-3 rounded">
                <p className="text-red-800 font-semibold text-sm">🚨 Patient Crashed!</p>
                <p className="text-red-700 text-xs mt-1">{crashReason}</p>
              </div>
            )}

            {/* Won State */}
            {gameState === "won" && (
              <div className="mt-4 bg-green-100 border-l-4 border-green-500 p-3 rounded">
                <p className="text-green-800 font-semibold text-sm flex items-center gap-2">
                  <Trophy size={16} /> Victory!
                </p>
                <p className="text-green-700 text-xs mt-1">Patient stabilized!</p>
                <p className="text-green-800 font-bold mt-2">Score: {score}</p>
              </div>
            )}

            {/* Running State - Show Progress */}
            {gameState === "running" && (
              <div className="mt-4 bg-blue-100 border-l-4 border-blue-500 p-3 rounded">
                <p className="text-blue-800 text-xs">
                  <strong>Stable time:</strong> {stableTimer.toFixed(1)}s / {params.stabilization_time}s
                </p>
                <p className="text-blue-800 text-xs mt-1">
                  <strong>Survival:</strong> {model.alive_time.toFixed(1)}s
                </p>
              </div>
            )}
          </div>

          {/* Right Section - Vital Signs Display and Graphs */}
          <div className="lg:col-span-3">
            
            {/* Vital Signs Cards - 4 metrics in a row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              
              {/* Heart Rate Card */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="text-red-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Heart Rate</span>
                </div>
                <p className={`text-2xl font-bold ${model.hr > 0.90 * model.HR_max ? 'text-red-600' : 'text-green-600'}`}>
                  {model.hr.toFixed(0)} bpm
                </p>
              </div>

              {/* Blood Pressure Card */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="text-blue-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Blood Pressure</span>
                </div>
                <p className={`text-2xl font-bold ${model.map < 65 ? 'text-red-600' : 'text-green-600'}`}>
                  {model.map.toFixed(0)} mmHg
                </p>
              </div>

              {/* Core Temperature Card */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Thermometer className="text-orange-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Core Temp</span>
                </div>
                <p className={`text-2xl font-bold ${model.core_temp > 39 ? 'text-red-600' : 'text-green-600'}`}>
                  {model.core_temp.toFixed(1)} °C
                </p>
              </div>

              {/* Hydration Card */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="text-cyan-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Hydration</span>
                </div>
                <p className={`text-2xl font-bold ${model.hydration < 0.85 ? 'text-red-600' : 'text-green-600'}`}>
                  {(model.hydration * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Graphs Grid - 4 charts in 2x2 layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Heart Rate Graph */}
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Heart Rate</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={(value) => Math.round(value)} />
                    <YAxis domain={[40, model.HR_max + 20]} tickFormatter={(value) => Math.round(value)} />
                    <Tooltip formatter={(value) => Math.round(value)} />
                    <ReferenceLine y={0.95 * model.HR_max} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="HR" stroke="#ef4444" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Blood Pressure Graph */}
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Blood Pressure (MAP)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={(value) => Math.round(value)} />
                    <YAxis domain={[40, 140]} tickFormatter={(value) => Math.round(value)} />
                    <Tooltip formatter={(value) => Math.round(value)} />
                    <ReferenceLine y={60} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="MAP" stroke="#3b82f6" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Core Temperature Graph */}
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Core Temperature</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={(value) => Math.round(value)} />
                    <YAxis domain={[35, 43]} tickFormatter={(value) => value.toFixed(1)} />
                    <Tooltip formatter={(value) => value.toFixed(1)} />
                    <ReferenceLine y={42} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="Temp" stroke="#f97316" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Hydration Graph */}
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Hydration Level</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={(value) => Math.round(value)} />
                    <YAxis domain={[70, 105]} tickFormatter={(value) => Math.round(value)} />
                    <Tooltip formatter={(value) => Math.round(value)} />
                    <ReferenceLine y={80} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="Hydration" stroke="#06b6d4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}