# Physiology Stabilizer Game

An interactive real-time physiological simulation game that challenges players to maintain patient vital signs within safe ranges through strategic intervention management.

## Biomedical Context

This application is designed for biomedical engineering students, healthcare professionals in training, and educators teaching human physiology and critical care concepts. The game simulates realistic physiological responses to exercise, environmental conditions, and hydration interventions, helping users understand the complex interplay between cardiovascular function, thermoregulation, and fluid balance in the human body. It provides a safe, engaging environment to learn about vital sign monitoring and intervention timing without risk to real patients.

## Quick Start Instructions

### Opening the Repository in GitHub Codespaces

1. Navigate to the repository on GitHub at `https://github.com/[your-username]/BME-3053C-Final-Project`
2. Click the green **"Code"** button at the top right of the repository
3. Select the **"Codespaces"** tab in the dropdown menu
4. Click **"Create codespace on main"** (or select an existing codespace if available)
5. Wait 1-2 minutes for the Codespace environment to fully initialize
6. The browser-based VS Code editor will open automatically with the project files loaded

### Running the Application

Once your Codespace is open, follow these commands in the integrated terminal:

```bash
npm install
npm run dev
```

After running these commands:
1. A notification will appear saying "Your application running on port 3000 is available"
2. Click **"Open in Browser"** to launch the game in a new tab
3. Alternatively, you can click the **"Ports"** tab at the bottom and open port 3000 manually

The application will be running at `http://localhost:3000` (or the Codespace forwarded URL).

## Usage Guide

### Step 1: Select Difficulty Level
- When the game loads, you'll see three difficulty options in the left sidebar: **Easy**, **Medium**, and **Hard**
- **Easy Mode**: 25-year-old patient, slower vital responses, more forgiving thresholds (75% hydration minimum)
- **Medium Mode**: 30-year-old patient, moderate responses, balanced thresholds (80% hydration minimum)
- **Hard Mode**: 45-year-old patient, faster responses, strict thresholds (85% hydration minimum)
- Select your desired difficulty before starting the game

### Step 2: Understand the Control Panel
The left sidebar contains three intervention sliders:
- **Exercise Intensity (0-100%)**: Controls patient's physical activity level. Higher exercise increases heart rate and core temperature while depleting hydration faster.
- **Ambient Temperature (0-50°C)**: Sets the environmental temperature. Extreme temperatures affect thermoregulation and cardiovascular stress.
- **Hydration Intake (0-2 L/hr)**: Controls fluid replacement rate. Essential for maintaining blood volume and preventing dehydration.

### Step 3: Monitor Vital Signs
Four vital signs are displayed prominently with color-coded warnings:
- **Heart Rate (bpm)**: Green when safe (<85% max), red when approaching danger zone
- **Blood Pressure - MAP (mmHg)**: Green above 70 mmHg, red when critically low
- **Core Temperature (°C)**: Green between 36-39°C, red when approaching heat stroke (>39°C)
- **Hydration (%)**: Green above 90%, red when dehydrated

### Step 4: Start the Simulation
- Click the **"▶️ Start"** button in the control panel
- Vital signs will begin updating in real-time
- Monitor the four live graphs showing trends for each vital sign
- Red dotted lines on graphs indicate critical thresholds

### Step 5: Keep the Patient Stable
Your goal is to maintain ALL vital signs in the safe range (green zone) for:
- **Easy Mode**: 20 consecutive seconds
- **Medium Mode**: 30 consecutive seconds
- **Hard Mode**: 45 consecutive seconds

**Strategy Tips:**
- Start with low exercise intensity (0-20%) to understand baseline responses
- In hot environments (>30°C), reduce exercise and increase hydration
- If heart rate rises too high, lower exercise intensity immediately
- Dehydration causes blood pressure to drop—increase hydration intake
- Core temperature rises with exercise and ambient heat—balance both carefully

### Step 6: Win or Learn from Crashes
**Win Condition**: Keep all vitals stable for the required time
- Success triggers a celebration with balloons 🎈
- Your final score is calculated based on survival time × difficulty multiplier
- Score breakdown: Base survival time + 50% stability bonus × difficulty (1.0x, 1.5x, or 2.0x)

**Crash Condition**: Any vital crosses a critical threshold
- The simulation stops immediately with a crash notification
- The specific reason is displayed (e.g., "Core temperature exceeded 42°C (heat stroke)!")
- Click **"▶️ New Game"** to try again with your new knowledge

### Step 7: Advanced Gameplay
Once comfortable with basic controls:
- Try maintaining moderate exercise (40-60%) while keeping vitals stable
- Challenge yourself with extreme ambient temperatures (5°C or 45°C)
- Experiment with the Hard difficulty for rapid vital changes
- Aim for high scores by extending stability time beyond minimum requirements

## Data Description

### Physiological Model Source

The simulation is based on established physiological principles from exercise physiology and critical care medicine:

**Heart Rate Model**:
- Maximum heart rate calculated using Tanaka formula: HR_max = 208 - (0.7 × age)
- Dynamic response includes exercise intensity, thermal strain (+10 bpm/°C above 37°C), and dehydration effects
- Time-constant based approach to target heart rate (tau values: 2-5 seconds depending on difficulty)

**Thermoregulation Model**:
- Heat production proportional to exercise intensity
- Environmental cooling based on temperature gradient (core - ambient)
- Evaporative cooling through sweating (efficiency varies by difficulty)
- Core temperature dynamics governed by heat capacity and energy balance

**Hydration/Cardiovascular Model**:
- Sweat rate increases with core temperature and exercise intensity
- Fluid balance affects blood volume and stroke volume
- Mean Arterial Pressure (MAP) calculated from cardiac output and systemic vascular resistance
- Compensatory mechanisms include vasoconstriction during dehydration and vasodilation during exercise/heat

**Key References**:
- Tanaka, H., Monahan, K. D., & Seals, D. R. (2001). Age-predicted maximal heart rate revisited. *Journal of the American College of Cardiology*, 37(1), 153-156.
- Cheuvront, S. N., & Kenefick, R. W. (2014). Dehydration: physiology, assessment, and performance effects. *Comprehensive Physiology*, 4(1), 257-285.

### License

This educational tool is provided for academic and training purposes. The physiological models are simplified representations intended for learning, not clinical decision-making.

## Project Structure

```
BME-3053C-FINAL-PROJECT/
│
├── src/                     # Source code directory
│   ├── App.jsx              # Main application component containing:
│   │                        #   - PatientModel class (physiological simulation engine)
│   │                        #   - DIFFICULTY_SETTINGS (Easy/Medium/Hard parameters)
│   │                        #   - PhysiologyGame component (UI and game logic)
│   │                        #   - Real-time vital signs updates and visualization
│   └── main.jsx             # React application entry point, renders App component
│
├── index.html               # Main HTML entry point, loads Tailwind CSS and React app
├── package.json             # Node.js dependencies and scripts configuration
├── vite.config.js           # Vite bundler configuration for dev server
├── .gitignore               # Git ignore file for node_modules and build files
│
└── README.md                # This file - project documentation
```

**Key Components**:

- **`index.html`**: Minimal HTML shell that loads Tailwind CSS from CDN for styling and mounts the React application to the DOM
  
- **`src/main.jsx`**: Initializes React and renders the root App component with StrictMode enabled for development warnings
  
- **`src/App.jsx`**: Contains the entire game logic including:
  - `DIFFICULTY_SETTINGS`: Object defining patient parameters for each difficulty level (age, thresholds, response rates)
  - `PatientModel` class: Implements the physiological simulation with methods for:
    - `update()`: Advances simulation by timestep, calculating heart rate, temperature, hydration, and blood pressure
    - `check_crash()`: Evaluates if any vital has crossed critical thresholds
    - `in_safe_range()`: Determines if all vitals are within target stability ranges
  - `PhysiologyGame` component: React functional component managing:
    - Game state (idle/running/crashed/won)
    - User input controls (sliders for exercise, temperature, hydration)
    - Real-time vital signs display with color-coded warnings
    - Four Recharts line graphs with critical threshold indicators
    - Score calculation and win/loss logic
  
- **`package.json`**: Defines project dependencies (React 18, Recharts for graphing, Lucide-react for icons) and npm scripts (`dev`, `build`, `preview`)

- **`vite.config.js`**: Configures Vite development server to run on all network interfaces (0.0.0.0) at port 3000, enabling access from Codespaces

**Dependencies**:
- **React 18**: Core UI framework for component-based architecture
- **Recharts**: Declarative charting library for real-time vital signs visualization
- **Lucide-react**: Icon library for UI elements (Heart, Thermometer, Activity, etc.)
- **Vite**: Fast development server and build tool optimized for React
- **Tailwind CSS**: Utility-first CSS framework loaded via CDN for responsive styling