import streamlit as st
import pandas as pd
import plotly.graph_objs as go
import time
from physiology_model import PatientModel, DIFFICULTY_SETTINGS

# Streamlit page config
st.set_page_config(page_title="Physiology Simulation Game", layout="wide")

st.title("🩺 Physiology Stabilizer Game")
st.markdown("**Goal:** Keep the patient's vitals stable by adjusting exercise, environment, and hydration!")

# Initialize session state
if "initialized" not in st.session_state:
    st.session_state.initialized = True
    st.session_state.difficulty = "Medium"
    st.session_state.model = PatientModel(difficulty="Medium")
    st.session_state.history = {"time": [], "HR": [], "MAP": [], "Temp": [], "Hydration": []}
    st.session_state.running = False
    st.session_state.score = 0
    st.session_state.stable_timer = 0
    st.session_state.game_state = "idle"  # idle, running, crashed, won
    st.session_state.crash_reason = ""
    st.session_state.last_update = time.time()

# Sidebar controls
st.sidebar.header("🎮 Game Controls")

# Difficulty selection
difficulty = st.sidebar.selectbox(
    "Difficulty Level", 
    list(DIFFICULTY_SETTINGS.keys()), 
    index=1,
    disabled=(st.session_state.game_state == "running")
)

# Reset model if difficulty changed
if difficulty != st.session_state.difficulty:
    st.session_state.difficulty = difficulty
    st.session_state.model = PatientModel(difficulty=difficulty)
    st.session_state.history = {"time": [], "HR": [], "MAP": [], "Temp": [], "Hydration": []}
    st.session_state.stable_timer = 0
    st.session_state.game_state = "idle"
    st.session_state.crash_reason = ""
    st.session_state.score = 0

age = DIFFICULTY_SETTINGS[difficulty]["age"]
st.sidebar.write(f"*Patient age: {age} years*")

st.sidebar.markdown("---")
st.sidebar.subheader("Patient Interventions")

# Control sliders
exercise = st.sidebar.slider("Exercise Intensity (%)", 0, 100, 0, step=5)
exercise_frac = exercise / 100.0
ambient_temp = st.sidebar.slider("Ambient Temperature (°C)", 0, 50, 25, step=1)
hydration_rate = st.sidebar.slider("Hydration Intake (L/hr)", 0.0, 2.0, 0.0, step=0.1)

st.sidebar.markdown("---")

# Game control buttons
col1, col2 = st.sidebar.columns(2)

if st.session_state.game_state == "idle":
    if col1.button("▶️ Start", use_container_width=True):
        st.session_state.running = True
        st.session_state.game_state = "running"
        st.session_state.last_update = time.time()
elif st.session_state.game_state == "running":
    if st.session_state.running:
        if col1.button("⏸️ Pause", use_container_width=True):
            st.session_state.running = False
    else:
        if col1.button("▶️ Resume", use_container_width=True):
            st.session_state.running = True
            st.session_state.last_update = time.time()
else:  # crashed or won
    if col1.button("▶️ New Game", use_container_width=True):
        st.session_state.model = PatientModel(difficulty=st.session_state.difficulty)
        st.session_state.history = {"time": [], "HR": [], "MAP": [], "Temp": [], "Hydration": []}
        st.session_state.running = False
        st.session_state.score = 0
        st.session_state.stable_timer = 0
        st.session_state.game_state = "idle"
        st.session_state.crash_reason = ""

if col2.button("🔄 Reset", use_container_width=True):
    st.session_state.model = PatientModel(difficulty=st.session_state.difficulty)
    st.session_state.history = {"time": [], "HR": [], "MAP": [], "Temp": [], "Hydration": []}
    st.session_state.running = False
    st.session_state.score = 0
    st.session_state.stable_timer = 0
    st.session_state.game_state = "idle"
    st.session_state.crash_reason = ""
    st.rerun()

model = st.session_state.model

# Game status display
if st.session_state.game_state == "crashed":
    st.error(f"🚨 **Patient Crashed!** {st.session_state.crash_reason}")
elif st.session_state.game_state == "won":
    st.success(f"✅ **Victory! Patient Stabilized!**")
    st.balloons()
    st.metric("Final Score", st.session_state.score)
elif st.session_state.game_state == "running":
    col_a, col_b = st.columns(2)
    col_a.info(f"⏱️ Survival Time: **{model.alive_time:.1f}s**")
    col_b.info(f"✓ Stable Time: **{st.session_state.stable_timer:.1f}s** / {model.params['stabilization_time']}s")

st.markdown("---")

# Vital signs metrics
metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

hr_color = "normal" if model.hr <= 0.85 * model.HR_max else "inverse"
metric_col1.metric("💓 Heart Rate", f"{model.hr:.0f} bpm", delta=None)

map_color = "normal" if model.map >= 70 else "inverse"
metric_col2.metric("🩸 Blood Pressure (MAP)", f"{model.map:.0f} mmHg", delta=None)

temp_color = "normal" if model.core_temp <= 39 else "inverse"
metric_col3.metric("🌡️ Core Temperature", f"{model.core_temp:.1f} °C", delta=None)

hyd_color = "normal" if model.hydration >= 0.90 else "inverse"
metric_col4.metric("💧 Hydration", f"{model.hydration*100:.0f}%", delta=None)

# Warning messages
warnings = []
if model.hr > 0.85 * model.HR_max:
    warnings.append("⚠️ Heart rate is very high!")
if model.map < 70:
    warnings.append("⚠️ Blood pressure is low!")
if model.core_temp > 39:
    warnings.append("⚠️ Core temperature is very high!")
if model.hydration < 0.90:
    warnings.append("⚠️ Patient is getting dehydrated!")

if warnings and st.session_state.game_state == "running":
    for warning in warnings:
        st.warning(warning)

st.markdown("---")

# Create charts
history_df = pd.DataFrame(st.session_state.history)

if not history_df.empty:
    # Create 2x2 grid of charts
    chart_col1, chart_col2 = st.columns(2)
    
    with chart_col1:
        # Heart Rate Chart
        fig1 = go.Figure()
        fig1.add_scatter(
            x=history_df["time"], 
            y=history_df["HR"], 
            mode='lines', 
            name="Heart Rate",
            line=dict(color="red" if model.hr > 0.85*model.HR_max else "green", width=2)
        )
        fig1.add_shape(
            type="line", 
            x0=0, 
            x1=history_df["time"].max(),
            y0=0.95*model.HR_max, 
            y1=0.95*model.HR_max,
            line=dict(color="red", dash="dot", width=2)
        )
        fig1.update_layout(
            title="Heart Rate (bpm)",
            xaxis_title="Time (s)",
            yaxis_title="HR (bpm)",
            height=300
        )
        st.plotly_chart(fig1, use_container_width=True)
        
        # Core Temperature Chart
        fig3 = go.Figure()
        fig3.add_scatter(
            x=history_df["time"], 
            y=history_df["Temp"], 
            mode='lines', 
            name="Core Temp",
            line=dict(color="red" if model.core_temp > 39 else "green", width=2)
        )
        fig3.add_shape(
            type="line", 
            x0=0, 
            x1=history_df["time"].max(),
            y0=42, 
            y1=42,
            line=dict(color="red", dash="dot", width=2)
        )
        fig3.update_layout(
            title="Core Temperature (°C)",
            xaxis_title="Time (s)",
            yaxis_title="Temperature (°C)",
            height=300
        )
        st.plotly_chart(fig3, use_container_width=True)
    
    with chart_col2:
        # MAP Chart
        fig2 = go.Figure()
        fig2.add_scatter(
            x=history_df["time"], 
            y=history_df["MAP"], 
            mode='lines', 
            name="MAP",
            line=dict(color="red" if model.map < 70 else "green", width=2)
        )
        fig2.add_shape(
            type="line", 
            x0=0, 
            x1=history_df["time"].max(),
            y0=60, 
            y1=60,
            line=dict(color="red", dash="dot", width=2)
        )
        fig2.update_layout(
            title="Mean Arterial Pressure (mmHg)",
            xaxis_title="Time (s)",
            yaxis_title="MAP (mmHg)",
            height=300
        )
        st.plotly_chart(fig2, use_container_width=True)
        
        # Hydration Chart
        fig4 = go.Figure()
        fig4.add_scatter(
            x=history_df["time"], 
            y=history_df["Hydration"], 
            mode='lines', 
            name="Hydration",
            line=dict(color="red" if model.hydration < 0.9 else "green", width=2)
        )
        fig4.add_shape(
            type="line", 
            x0=0, 
            x1=history_df["time"].max(),
            y0=80, 
            y1=80,
            line=dict(color="red", dash="dot", width=2)
        )
        fig4.update_layout(
            title="Hydration Level (%)",
            xaxis_title="Time (s)",
            yaxis_title="Hydration (%)",
            height=300
        )
        st.plotly_chart(fig4, use_container_width=True)
else:
    st.info("📊 Charts will appear when simulation starts...")

# Simulation loop
if st.session_state.running and st.session_state.game_state == "running":
    # Update simulation
    current_time = time.time()
    dt = min(current_time - st.session_state.last_update, 0.5)  # Cap at 0.5s
    st.session_state.last_update = current_time
    
    model.update(exercise_frac, ambient_temp, hydration_rate, dt=dt)
    
    # Log history
    st.session_state.history["time"].append(model.time)
    st.session_state.history["HR"].append(model.hr)
    st.session_state.history["MAP"].append(model.map)
    st.session_state.history["Temp"].append(model.core_temp)
    st.session_state.history["Hydration"].append(model.hydration * 100.0)
    
    # Check crash
    crashed, reason = model.check_crash()
    if crashed:
        st.session_state.running = False
        st.session_state.game_state = "crashed"
        st.session_state.crash_reason = reason
        st.rerun()
    
    # Check stability
    if model.in_safe_range():
        st.session_state.stable_timer += dt
    else:
        st.session_state.stable_timer = 0
    
    # Check win condition
    if st.session_state.stable_timer >= model.params["stabilization_time"]:
        st.session_state.running = False
        st.session_state.game_state = "won"
        
        # Calculate score
        diff_mult = {"Easy": 1.0, "Medium": 1.5, "Hard": 2.0}[st.session_state.difficulty]
        base_score = model.alive_time
        stability_bonus = model.alive_time * 0.5
        final_score = int((base_score + stability_bonus) * diff_mult)
        st.session_state.score = final_score
        st.rerun()
    
    # Auto-refresh for smooth animation
    time.sleep(0.1)
    st.rerun()