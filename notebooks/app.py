import streamlit as st
import pandas as pd
import plotly.graph_objs as go
from physiology_model import PatientModel, DIFFICULTY_SETTINGS

# Streamlit page config for wide layout
st.set_page_config(page_title="Physiology Simulation Game", layout="wide")

st.title("🩺 Physiology Stabilizer Game")
st.markdown("**Goal:** Keep the patient’s vitals stable by adjusting exercise, environment, and hydration. Avoid crashes and try to stabilize for the win!")

# Sidebar controls for game setup
st.sidebar.header("Simulation Controls")
difficulty = st.sidebar.selectbox("Difficulty Level", list(DIFFICULTY_SETTINGS.keys()), index=1)
age = DIFFICULTY_SETTINGS[difficulty]["age"]
st.sidebar.write(f"*(Patient age set to {age} years for {difficulty} mode.)*")

# Sliders for user input parameters
exercise = st.sidebar.slider("Exercise Intensity (%max)", 0, 100, 0, step=5)
exercise_frac = exercise / 100.0
ambient_temp = st.sidebar.slider("Ambient Temperature (°C)", 0, 50, 25, step=1)
hydration_rate = st.sidebar.slider("Hydration Intake (L per hour)", 0.0, 2.0, 0.0, step=0.1)

# Start/stop buttons
col1, col2 = st.sidebar.columns(2)
start_sim = col1.button("Start")
stop_sim = col2.button("Stop")

# Initialize session state for simulation
if "model" not in st.session_state or st.session_state.get("difficulty") != difficulty:
    st.session_state.model = PatientModel(difficulty=difficulty)
    st.session_state.history = {"time": [], "HR": [], "MAP": [], "Temp": [], "Hydration": []}
    st.session_state.running = False
    st.session_state.difficulty = difficulty
    st.session_state.score = 0
    st.session_state.stable_timer = 0

model = st.session_state.model

# If Start pressed, toggle running state
if start_sim:
    st.session_state.running = True
if stop_sim:
    st.session_state.running = False

# Metrics display
metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)
metric_col1.metric("Heart Rate", f"{model.hr:.0f} bpm")
metric_col2.metric("Mean A. Pressure", f"{model.map:.0f} mmHg")
metric_col3.metric("Core Temp", f"{model.core_temp:.1f} °C")
metric_col4.metric("Hydration", f"{model.hydration*100:.0f} %")

# Warning messages if any vital is outside normal range (but not crashed yet)
if model.hr > 0.85 * model.HR_max:
    st.warning("Heart rate is very high!")
if model.map < 70:
    st.warning("Blood pressure is low!")
if model.core_temp > 39:
    st.warning("Core temperature is very high!")
if model.hydration < 0.90:
    st.warning("Patient is getting dehydrated!")

# Define charts (using Plotly for better control in this example)
# Prepare data for charts from history
history_df = pd.DataFrame(st.session_state.history)
if not history_df.empty:
    fig1 = go.Figure(layout=dict(title="Heart Rate (bpm) over time", xaxis_title="Time (s)", yaxis_title="HR (bpm)"))
    fig1.add_scatter(x=history_df["time"], y=history_df["HR"], mode='lines', name="Heart Rate",
                     line=dict(color=("red" if model.hr > 0.85*model.HR_max else "green")))
    # We can add a horizontal line for max safe HR
    fig1.add_shape(type="line", x0=0, x1=history_df["time"].max() if len(history_df)>0 else 1,
                   y0=0.95*model.HR_max, y1=0.95*model.HR_max,
                   line=dict(color="red", dash="dot"))
    fig2 = go.Figure(layout=dict(title="Mean Arterial Pressure (mmHg) over time", xaxis_title="Time (s)", yaxis_title="MAP (mmHg)"))
    fig2.add_scatter(x=history_df["time"], y=history_df["MAP"], mode='lines', name="MAP",
                     line=dict(color=("red" if model.map < 70 else "green")))
    fig2.add_shape(type="line", x0=0, x1=history_df["time"].max() if len(history_df)>0 else 1,
                   y0=60, y1=60, line=dict(color="red", dash="dot"))
    fig3 = go.Figure(layout=dict(title="Core Temperature (°C) over time", xaxis_title="Time (s)", yaxis_title="Core Temp (°C)"))
    fig3.add_scatter(x=history_df["time"], y=history_df["Temp"], mode='lines', name="Core Temp",
                     line=dict(color=("red" if model.core_temp > 39 else "green")))
    fig3.add_shape(type="line", x0=0, x1=history_df["time"].max() if len(history_df)>0 else 1,
                   y0=42, y1=42, line=dict(color="red", dash="dot"))
    fig4 = go.Figure(layout=dict(title="Hydration (% body water) over time", xaxis_title="Time (s)", yaxis_title="Hydration (%)"))
    fig4.add_scatter(x=history_df["time"], y=history_df["Hydration"], mode='lines', name="Hydration",
                     line=dict(color=("red" if model.hydration < 0.9 else "green")))
    fig4.add_shape(type="line", x0=0, x1=history_df["time"].max() if len(history_df)>0 else 1,
                   y0=80, y1=80, line=dict(color="red", dash="dot"))
    # Render charts in a 2x2 grid
    c1, c2 = st.columns(2)
    c1.plotly_chart(fig1, use_container_width=True)
    c1.plotly_chart(fig3, use_container_width=True)
    c2.plotly_chart(fig2, use_container_width=True)
    c2.plotly_chart(fig4, use_container_width=True)

# Simulation loop execution
# We run a short loop of a few steps per refresh for smooth updating
if st.session_state.running:
    # Run e.g. 5 seconds of simulation per page refresh to allow UI updates
    # (In a real app, this could run continuously in a while loop with time.sleep,
    # but Streamlit's execution model requires yielding control to update the page.)
    for t in range(5):
        # Update model for one second
        model.update(exercise_frac, ambient_temp, hydration_rate, dt=1.0)
        crashed, reason = model.check_crash()
        # Log history for plotting
        st.session_state.history["time"].append(model.time)
        st.session_state.history["HR"].append(model.hr)
        st.session_state.history["MAP"].append(model.map)
        st.session_state.history["Temp"].append(model.core_temp)
        st.session_state.history["Hydration"].append(model.hydration * 100.0)
        # Check crash condition
        if crashed:
            st.session_state.running = False
            st.error(f"🚨 Patient crashed: {reason}")
            break
        # Check stabilization (win) condition
        if model.in_safe_range():
            st.session_state.stable_timer += 1
        else:
            # reset timer if patient goes out of safe range
            st.session_state.stable_timer = 0
        if st.session_state.stable_timer >= model.params["stabilization_time"]:
            st.session_state.running = False
            st.success("✅ Patient vitals stabilized! You win!")
            # Calculate score
            base_score = model.alive_time
            diff_mult = 1.0
            if difficulty == "Medium": diff_mult = 1.5
            if difficulty == "Hard": diff_mult = 2.0
            stability_bonus = model.alive_time * 0.5  # e.g. extra 50% for not crashing
            final_score = int((base_score + stability_bonus) * diff_mult)
            st.session_state.score = final_score
            st.balloons()
            st.write(f"**Survival Time:** {model.alive_time:.0f} s, **Score:** {final_score} (difficulty ×{diff_mult})")
            break

    # Rerun the app after the loop to update the UI with new values
    st.rerun()
else:
    # If not running, but simulation has ended (crash or win), show final stats/score.
    if not start_sim:
        # (This condition ensures we don't show score at app load before any run)
        if st.session_state.score:
            st.write(f"**Final Score:** {st.session_state.score}")
        st.write("*(Adjust parameters and press Start to run a new simulation.)*")
