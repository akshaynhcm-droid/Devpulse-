import pytest
from services.cost_tracker import calculate_cost, detect_anomaly, get_cost_breakdown

def test_gpt4_cost_calculation():
    cost = calculate_cost("gpt-4", 1000, 500)
    assert cost == 0.06

def test_gpt35_cost_calculation():
    cost = calculate_cost("gpt-3.5-turbo", 1000, 500)
    assert cost == 0.0025

def test_unknown_model_returns_zero():
    cost = calculate_cost("unknown-model", 1000, 500)
    assert cost == 0.0

def test_anomaly_detection_spike():
    history = [0.01, 0.01, 0.01, 0.01]
    is_anomaly = detect_anomaly(1.50, history)
    assert is_anomaly == True

def test_anomaly_detection_normal():
    history = [0.5, 0.6, 0.55, 0.6]
    is_anomaly = detect_anomaly(0.65, history)
    assert is_anomaly == False

def test_anomaly_insufficient_data():
    history = [0.5, 0.6]
    is_anomaly = detect_anomaly(1.0, history)
    assert is_anomaly == False

def test_cost_breakdown():
    breakdown = get_cost_breakdown("gpt-4", 1000, 500)
    assert breakdown["input_cost"] == 0.03
    assert breakdown["output_cost"] == 0.03
    assert breakdown["total_cost"] == 0.06