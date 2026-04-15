import statistics
from typing import List

PRICING = {
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-3.5-turbo": {"input": 0.0015, "output": 0.002},
    "gpt-3.5-turbo-0125": {"input": 0.0005, "output": 0.0015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
    "claude-3.5-haiku": {"input": 0.0008, "output": 0.004},
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "o1": {"input": 0.015, "output": 0.06},
    "o1-mini": {"input": 0.003, "output": 0.012},
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    model_key = model.lower()
    if model_key not in PRICING:
        return 0.0
    
    rates = PRICING[model_key]
    input_cost = (input_tokens / 1000) * rates["input"]
    output_cost = (output_tokens / 1000) * rates["output"]
    return round(input_cost + output_cost, 6)

def get_pricing_for_model(model: str) -> dict:
    model_key = model.lower()
    return PRICING.get(model_key, {"input": 0.0, "output": 0.0})

def detect_anomaly(current_cost: float, history: List[float], threshold: float = 2.0) -> bool:
    if not history or len(history) < 3:
        return False
    
    mean = statistics.mean(history)
    stdev = statistics.stdev(history)
    
    if stdev == 0:
        return current_cost > mean * 1.5
    
    z_score = (current_cost - mean) / stdev
    return z_score > threshold

def estimate_tokens_from_text(text: str) -> int:
    return len(text) // 4

def get_cost_breakdown(model: str, input_tokens: int, output_tokens: int) -> dict:
    model_key = model.lower()
    rates = PRICING.get(model_key, {"input": 0.0, "output": 0.0})
    
    return {
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_cost": round((input_tokens / 1000) * rates["input"], 6),
        "output_cost": round((output_tokens / 1000) * rates["output"], 6),
        "total_cost": calculate_cost(model, input_tokens, output_tokens)
    }