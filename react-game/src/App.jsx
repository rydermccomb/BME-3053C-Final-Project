import React, { useState, useEffect, useRef } from 'react';
import { Heart, Thermometer, Droplets, Activity, Play, Pause, RotateCcw, Trophy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// Difficulty settings
const DIFFICULTY_SETTINGS = {
  Easy: {
    age: 25,
    HR_rest: 60.0,
    tau_HR: 5.0,
    heat_capacity: 0.5,
    sweat_efficiency: 1.2,
    sweat_rate_base: 0.8,
    cooling_factor: 1.2,
    compensation_factor: 1.2,
    thresholds: { HR_frac: 1.00, MAP: 55, Temp: 42.5, Hydration: 0.75 },
    stabilization_time: 20
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
    thresholds: { HR_frac: 0.95, MAP: 60, Temp: 42.0, Hydration: 0.80 },
    stabilization_time: 30
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
    thresholds: { HR_frac: 0.95, MAP: 60, Temp: 41.0, Hydration: 0.85 },
    stabilization_time: 45
  }
};

class PatientModel {
  constructor(difficulty = "Medium") {
    this.params = DIFFICULTY_SETTINGS[difficulty];
    const age = this.params.age;
    this.HR_max = 208.0 - 0.7 * age;
    this.HR_rest = this.params.HR_rest;
    this.hr = this.HR_rest;
    this.map = 90.0;
    this.core_temp = 37.0;
    this.hydration = 1.0;
    this.time = 0.0;
    this.alive_time = 0.0;
  }

  update(exercise_intensity, ambient_temp, hydration_intake_rate, dt = 1.0) {
    let target_hr = this.HR_rest + exercise_intensity * (this.HR_max - this.HR_rest);
    if (this.core_temp > 37.0) {
      target_hr += 10 * (this.core_temp - 37.0);
    }
    target_hr += 50 * (1.0 - this.hydration) * 0.1;
    const tau = this.params.tau_HR;
    this.hr += (target_hr - this.hr) * (dt / tau);

    const heat_prod = 0.2 * exercise_intensity;
    const cooling_env = this.params.cooling_factor * 0.1 * (this.core_temp - ambient_temp);
    let cooling_sweat = 0.0;
    if (this.core_temp > 37.0 && this.hydration > 0.0) {
      const sweat_factor = this.params.sweat_efficiency * 0.1 * (this.core_temp - 37.0);
      cooling_sweat = sweat_factor;
    }
    const dT = (heat_prod - cooling_env - cooling_sweat) / this.params.heat_capacity;
    this.core_temp += dT * dt;

    let sweat_rate = 0.0;
    if (this.core_temp > 37.0) {
      sweat_rate = this.params.sweat_rate_base * 0.001 * (this.core_temp - 36.5);
      sweat_rate += this.params.sweat_rate_base * 0.001 * exercise_intensity;
    }
    this.hydration -= sweat_rate * dt;
    const liters_per_sec = hydration_intake_rate / 3600.0;
    const fraction_per_sec = liters_per_sec / 42.0;
    this.hydration += fraction_per_sec * dt;
    this.hydration = Math.max(0, Math.min(1, this.hydration));

    const hydration_factor = this.hydration;
    const CO = this.hr * hydration_factor;
    const intensity_effect = 0.5 * exercise_intensity;
    const temp_effect = 0.2 * Math.max(0, this.core_temp - 37.0);
    const dehydr_effect = 0.5 * (1.0 - this.hydration);
    let SVR_rel = 1.0 - intensity_effect - temp_effect + dehydr_effect;
    SVR_rel *= this.params.compensation_factor;
    SVR_rel = Math.min(Math.max(SVR_rel, 0.2), 2.0);
    const baseline_MAP = 90.0;
    const baseline_CO = this.HR_rest;
    this.map = baseline_MAP * (CO / baseline_CO) * SVR_rel;

    this.time += dt;
    this.alive_time += dt;
  }

  check_crash() {
    const thr = this.params.thresholds;
    if (this.hr > thr.HR_frac * this.HR_max) {
      return [true, `Heart rate exceeded ${(thr.HR_frac * 100).toFixed(0)}% of max!`];
    }
    if (this.map < thr.MAP) {
      return [true, `Mean arterial pressure fell below ${thr.MAP} mmHg!`];
    }
    if (this.core_temp > thr.Temp) {
      return [true, `Core temperature exceeded ${thr.Temp} °C (heat stroke)!`];
    }
    if (this.core_temp < 33.0) {
      return [true, "Core temperature below 33 °C (severe hypothermia)!"];
    }
    if (this.hydration < thr.Hydration) {
      return [true, `Hydration fell below ${(thr.Hydration * 100).toFixed(0)}%!`];
    }
    return [false, ""];
  }

  in_safe_range() {
    if (this.hr > 0.85 * this.HR_max || this.hr < 50) return false;
    if (this.map < 70 || this.map > 120) return false;
    if (this.core_temp < 36.0 || this.core_temp > 38.5) return false;
    if (this.hydration < 0.90) return false;
    return true;
  }
}

export default function PhysiologyGame() {
  const [difficulty, setDifficulty] = useState("Medium");
  const [exercise, setExercise] = useState(0);
  const [ambientTemp, setAmbientTemp] = useState(25);
  const [hydrationRate, setHydrationRate] = useState(0);
  const [running, setRunning] = useState(false);
  const [gameState, setGameState] = useState("idle"); // idle, running, crashed, won
  const [crashReason, setCrashReason] = useState("");
  const [score, setScore] = useState(0);
  const [stableTimer, setStableTimer] = useState(0);
  
  const modelRef = useRef(new PatientModel(difficulty));
  const [history, setHistory] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    modelRef.current = new PatientModel(difficulty);
    setHistory([]);
    setStableTimer(0);
    setGameState("idle");
    setCrashReason("");
    setScore(0);
  }, [difficulty]);

  useEffect(() => {
    if (running && gameState === "running") {
      intervalRef.current = setInterval(() => {
        const model = modelRef.current;
        const exercise_frac = exercise / 100.0;
        
        model.update(exercise_frac, ambientTemp, hydrationRate, 0.5);
        
        const [crashed, reason] = model.check_crash();
        
        setHistory(prev => [...prev.slice(-100), {
          time: model.time,
          HR: model.hr,
          MAP: model.map,
          Temp: model.core_temp,
          Hydration: model.hydration * 100
        }]);

        if (crashed) {
          setRunning(false);
          setGameState("crashed");
          setCrashReason(reason);
          clearInterval(intervalRef.current);
          return;
        }

        if (model.in_safe_range()) {
          setStableTimer(prev => prev + 0.5);
        } else {
          setStableTimer(0);
        }

        if (stableTimer >= model.params.stabilization_time) {
          setRunning(false);
          setGameState("won");
          const diffMult = difficulty === "Easy" ? 1.0 : difficulty === "Medium" ? 1.5 : 2.0;
          const finalScore = Math.floor((model.alive_time + model.alive_time * 0.5) * diffMult);
          setScore(finalScore);
          clearInterval(intervalRef.current);
        }
      }, 500);

      return () => clearInterval(intervalRef.current);
    }
  }, [running, gameState, exercise, ambientTemp, hydrationRate, stableTimer, difficulty]);

  const handleStart = () => {
    if (gameState === "idle") {
      setGameState("running");
      setRunning(true);
    } else {
      setRunning(!running);
    }
  };

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

  const model = modelRef.current;
  const params = DIFFICULTY_SETTINGS[difficulty];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <h1 className="text-4xl font-bold text-indigo-900 mb-2 flex items-center gap-3">
            <Heart className="text-red-500" size={40} />
            Physiology Stabilizer Game
          </h1>
          <p className="text-gray-600">Keep the patient's vitals stable by adjusting exercise, environment, and hydration. Survive and stabilize to win!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-indigo-900">Controls</h2>
            
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

            {gameState === "crashed" && (
              <div className="mt-4 bg-red-100 border-l-4 border-red-500 p-3 rounded">
                <p className="text-red-800 font-semibold text-sm">🚨 Patient Crashed!</p>
                <p className="text-red-700 text-xs mt-1">{crashReason}</p>
              </div>
            )}

            {gameState === "won" && (
              <div className="mt-4 bg-green-100 border-l-4 border-green-500 p-3 rounded">
                <p className="text-green-800 font-semibold text-sm flex items-center gap-2">
                  <Trophy size={16} /> Victory!
                </p>
                <p className="text-green-700 text-xs mt-1">Patient stabilized!</p>
                <p className="text-green-800 font-bold mt-2">Score: {score}</p>
              </div>
            )}

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

          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="text-red-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Heart Rate</span>
                </div>
                <p className={`text-2xl font-bold ${model.hr > 0.85 * model.HR_max ? 'text-red-600' : 'text-green-600'}`}>
                  {model.hr.toFixed(0)} bpm
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="text-blue-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Blood Pressure</span>
                </div>
                <p className={`text-2xl font-bold ${model.map < 70 ? 'text-red-600' : 'text-green-600'}`}>
                  {model.map.toFixed(0)} mmHg
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Thermometer className="text-orange-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Core Temp</span>
                </div>
                <p className={`text-2xl font-bold ${model.core_temp > 39 ? 'text-red-600' : 'text-green-600'}`}>
                  {model.core_temp.toFixed(1)} °C
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="text-cyan-500" size={24} />
                  <span className="text-sm font-semibold text-gray-600">Hydration</span>
                </div>
                <p className={`text-2xl font-bold ${model.hydration < 0.90 ? 'text-red-600' : 'text-green-600'}`}>
                  {(model.hydration * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Heart Rate</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[40, model.HR_max + 20]} />
                    <Tooltip />
                    <ReferenceLine y={0.95 * model.HR_max} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="HR" stroke="#ef4444" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Blood Pressure (MAP)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[40, 140]} />
                    <Tooltip />
                    <ReferenceLine y={60} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="MAP" stroke="#3b82f6" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Core Temperature</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[35, 43]} />
                    <Tooltip />
                    <ReferenceLine y={42} stroke="red" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="Temp" stroke="#f97316" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2 text-gray-700">Hydration Level</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[70, 105]} />
                    <Tooltip />
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