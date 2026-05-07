# ============================================================
# reasoning.py
# PURPOSE: The brain - takes vision data and infers danger
# OWNER: Your name
# ============================================================

import requests
import json

# ============================================================
# SWITCH BETWEEN GROQ (FREE) AND AMD (FINAL)
# ============================================================
USE_GROQ = True

if USE_GROQ:
    API_URL = "https://api.groq.com/openai/v1/chat/completions"
    API_KEY = "REPLACED_SECRET"   # ← paste your Groq key
    MODEL = "llama-3.1-8b-instant"
else:
    API_URL = "http://YOUR_AMD_IP:8001/v1/chat/completions"
    API_KEY = ""
    MODEL = "mistralai/Mistral-7B-Instruct-v0.3"


def reason_about_scene(vision_data):
    """
    Takes vision analysis dictionary,
    reasons deeply about what is REALLY happening,
    returns structured risk assessment
    """

    # Build a human-readable summary from vision data
    scene_text = f"""
CROWD VISION DATA:
- Overall Density: {vision_data.get('crowd_density', 'unknown')}
- Movement Pattern: {vision_data.get('movement_pattern', 'unknown')}
- People Behavior: {', '.join(vision_data.get('body_language', []))}
- Visible Distress Signs: {vision_data.get('visible_distress', False)}
- Estimated People Count: {vision_data.get('crowd_count_estimate', 0)}
- Problem Areas: {vision_data.get('concern_areas', 'none')}

ZONE-BY-ZONE BREAKDOWN:
- North Zone: {vision_data.get('zone_descriptions', {}).get('north', 'unknown')}
- South Zone: {vision_data.get('zone_descriptions', {}).get('south', 'unknown')}
- East Zone: {vision_data.get('zone_descriptions', {}).get('east', 'unknown')}
- West Zone: {vision_data.get('zone_descriptions', {}).get('west', 'unknown')}
"""

    # The prompt that makes the AI reason, not just describe
    prompt = f"""You are an expert crowd safety analyst with 20 years experience at stadiums, airports, and public events.
You have seen stampedes, crowd crushes, and panic situations.

Analyze this crowd scene and go BEYOND description — infer what is ABOUT TO HAPPEN.

{scene_text}

Think step by step:
1. What is the crowd collectively trying to do?
2. What physical forces are building up?
3. Which zone will fail first?
4. How many minutes until this becomes critical?
5. What is the single biggest risk right now?

Respond ONLY in this JSON format. No extra text:
{{
  "collective_intent": "panic/celebration/evacuation/normal/confusion/surge",
  "risk_level": number from 1 to 10,
  "primary_danger": "stampede/crush/bottleneck/surge/suffocation/none",
  "most_dangerous_zone": "north/south/east/west/center",
  "second_dangerous_zone": "north/south/east/west/center/none",
  "minutes_until_critical": number or null if already critical,
  "is_already_critical": true or false,
  "key_risk_factor": "single sentence - the ONE thing causing the most danger",
  "reasoning": "2-3 sentences explaining your full assessment",
  "confidence": number from 0 to 100
}}"""

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            API_URL,
            headers=headers,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.1  # Low = more consistent, less random
            },
            timeout=30
        )

        ai_text = response.json()["choices"][0]["message"]["content"]

        # Extract just the JSON part
        start = ai_text.find("{")
        end = ai_text.rfind("}") + 1
        result = json.loads(ai_text[start:end])

        return result

    except Exception as e:
        print(f"Reasoning failed: {e}")
        return {
            "collective_intent": "unknown",
            "risk_level": 5,
            "primary_danger": "unknown",
            "most_dangerous_zone": "unknown",
            "second_dangerous_zone": "unknown",
            "minutes_until_critical": 5,
            "is_already_critical": False,
            "key_risk_factor": "Analysis failed - treat as medium risk",
            "reasoning": "Could not analyze. Default medium risk assigned.",
            "confidence": 20
        }