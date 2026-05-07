# ============================================================
# critic.py
# PURPOSE: Second AI that checks and improves first AI's work
# This is YOUR biggest differentiator in the hackathon
# OWNER: Your name
# ============================================================

import requests
import json

# Same switch as reasoning.py
USE_GROQ = True

if USE_GROQ:
    API_URL = "https://api.groq.com/openai/v1/chat/completions"
    API_KEY = "REPLACED_SECRET"
    MODEL = "llama-3.1-8b-instant"
else:
    API_URL = "http://YOUR_AMD_IP:8001/v1/chat/completions"
    API_KEY = ""
    MODEL = "mistralai/Mistral-7B-Instruct-v0.3"


def critique_and_refine(vision_data, initial_assessment):
    """
    Takes the initial AI assessment and challenges it.
    Looks for mistakes, missed risks, or false alarms.
    Returns improved final assessment.
    """

    prompt = f"""You are the SENIOR crowd safety analyst reviewing a junior analyst's report.
Your job is to be critical and improve their assessment. Do not blindly agree.

ORIGINAL SCENE DATA:
- Crowd density: {vision_data.get('crowd_density')}
- Movement: {vision_data.get('movement_pattern')}
- Behavior: {', '.join(vision_data.get('body_language', []))}
- Distress visible: {vision_data.get('visible_distress')}
- People count: {vision_data.get('crowd_count_estimate')}
- Problem areas: {vision_data.get('concern_areas')}

JUNIOR ANALYST'S ASSESSMENT:
- Risk Level: {initial_assessment.get('risk_level')}/10
- Situation: {initial_assessment.get('collective_intent')}
- Primary Danger: {initial_assessment.get('primary_danger')}
- Most Dangerous Zone: {initial_assessment.get('most_dangerous_zone')}
- Minutes Until Critical: {initial_assessment.get('minutes_until_critical')}
- Key Risk: {initial_assessment.get('key_risk_factor')}
- Reasoning: {initial_assessment.get('reasoning')}
- Confidence: {initial_assessment.get('confidence')}%

REVIEW QUESTIONS (think about each):
1. Is the risk level too high (false alarm) or too low (dangerous underestimate)?
2. Did they correctly identify the most dangerous zone?
3. Is the time estimate realistic?
4. What did they MISS that you can see in the data?
5. Should emergency services be called or is this manageable?

Respond ONLY in this JSON format:
{{
  "final_risk_level": number 1-10,
  "final_collective_intent": "panic/celebration/evacuation/normal/confusion/surge",
  "final_primary_danger": "stampede/crush/bottleneck/surge/suffocation/none",
  "final_most_dangerous_zone": "north/south/east/west/center",
  "final_minutes_until_critical": number or null,
  "final_is_critical": true or false,
  "what_junior_missed": "what the first analyst got wrong or missed",
  "what_junior_got_right": "what they assessed correctly",
  "final_key_risk": "the most important single risk factor",
  "final_reasoning": "your complete improved assessment in 2-3 sentences",
  "call_emergency_services": true or false,
  "final_confidence": number 0-100
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
                "max_tokens": 600,
                "temperature": 0.1
            },
            timeout=30
        )

        ai_text = response.json()["choices"][0]["message"]["content"]
        start = ai_text.find("{")
        end = ai_text.rfind("}") + 1
        result = json.loads(ai_text[start:end])
        return result

    except Exception as e:
        print(f"Critic failed: {e}")
        # If critic fails, return initial assessment in final format
        return {
            "final_risk_level": initial_assessment.get("risk_level", 5),
            "final_collective_intent": initial_assessment.get("collective_intent", "unknown"),
            "final_primary_danger": initial_assessment.get("primary_danger", "unknown"),
            "final_most_dangerous_zone": initial_assessment.get("most_dangerous_zone", "unknown"),
            "final_minutes_until_critical": initial_assessment.get("minutes_until_critical"),
            "final_is_critical": initial_assessment.get("is_already_critical", False),
            "what_junior_missed": "Critic unavailable",
            "what_junior_got_right": "Initial assessment used as fallback",
            "final_key_risk": initial_assessment.get("key_risk_factor", "unknown"),
            "final_reasoning": initial_assessment.get("reasoning", ""),
            "call_emergency_services": initial_assessment.get("risk_level", 0) >= 8,
            "final_confidence": initial_assessment.get("confidence", 30)
        }