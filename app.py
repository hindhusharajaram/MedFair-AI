from flask import Flask, request, jsonify, render_template
import random

app = Flask(__name__)

# In-memory storage
patients = []
analysis_results = []
bias_score = 0.0

# Settings
default_settings = {
    "bias_sensitivity": 50,
    "fairness_mode": False,
    "treatment_standardization": "Moderate",
    "normalize_confidence": False
}
settings = default_settings.copy()

@app.route('/')
def index():
    return render_template('index.html')

def get_base_confidence(age, severity):
    base = 85
    if severity == 'High':
        base -= 5
    if age > 65:
        base -= 5
    return max(0, min(100, base + random.randint(-5, 5)))

def generate_treatment_plan(age, conditions):
    # Base treatment logic
    plan = {
        "medication": ["Prescribe standard symptom relief"],
        "lifestyle": ["Rest and hydrate"],
        "tests": []
    }
    if age > 60:
        plan["tests"].append("Comprehensive metabolic panel")
    if "diabetes" in conditions.lower():
        plan["tests"].append("HbA1c test")
    return plan

def simulate_bias(results, current_settings):
    global bias_score
    sensitivity = int(current_settings.get("bias_sensitivity", 50))
    is_fairness_mode = current_settings.get("fairness_mode", False)
    normalize_conf = current_settings.get("normalize_confidence", False)

    if is_fairness_mode:
        bias_score = random.uniform(0, 5) # minimal bias
        return results

    # Unfair bias logic
    bias_delta = 0
    calculated_bias = 0

    for res in results:
        p = res['patient']
        # Gender bias -> Lower confidence for women
        if p['gender'].lower() == 'female' and not normalize_conf:
            drop = int(10 * (sensitivity / 50.0))
            res['confidence'] = max(30, res['confidence'] - drop)
            calculated_bias += drop

        # Age bias -> older patients simpler plans
        if int(p['age']) > 65:
            # Simpler plans
            res['treatment_plan']['medication'] = ["Continue current medication"]
            res['treatment_plan']['tests'] = []
            res['clinical_reasoning'] += " Decided on conservative management given advanced age."
            calculated_bias += int(15 * (sensitivity / 50.0))

    if len(results) > 0:
        bias_score = min(100, max(0, (calculated_bias / len(results)) * 2.5))
        
    return results

@app.route('/analyze', methods=['POST'])
def analyze():
    global patients, analysis_results, bias_score
    data = request.json
    received_patients = data.get('patients', [])
    
    if not received_patients:
        return jsonify({"error": "No data available. Please add patients."}), 400

    patients = received_patients
    results = []

    for p in patients:
        age_val = int(p.get('age', 30))
        severity = p.get('severity', 'Medium')
        duration = p.get('duration', '1-3 days')
        symptom = p.get('symptom', 'Unknown')
        conditions = p.get('conditions', 'None')
        lifestyle = p.get('lifestyle', 'Moderate')

        # Complex simulation
        condition_derived = f"Acute {symptom} expression"
        if severity == 'High':
            risk_level = "High Risk"
        elif age_val > 60 or lifestyle == 'High':
            risk_level = "Medium Risk"
        else:
            risk_level = "Low Risk"

        treatment = generate_treatment_plan(age_val, conditions)
        
        personalized_care = f"Patient {p['name']} presents with {symptom}. Given their age ({age_val}), " \
                            f"and {lifestyle.lower()} lifestyle risk, monitor closely for {duration}. " \
                            f"Accounting for pre-existing: {conditions}."

        recommended_action = "Routine care"
        if risk_level == "High Risk":
            recommended_action = "Immediate consultation"
        elif risk_level == "Medium Risk":
            recommended_action = "Monitoring"

        clinical_reasoning = f"Based on {severity.lower()} severity and {duration} duration, " \
                             f"considering patient's {lifestyle.lower()} lifestyle risk and pre-existing {conditions}."

        conf = get_base_confidence(age_val, severity)

        res = {
            "patient": {
                "name": p['name'],
                "age": age_val,
                "gender": p.get('gender', 'Unknown')
            },
            "clinical_assessment": condition_derived,
            "risk_level": risk_level,
            "treatment_plan": treatment,
            "personalized_care": personalized_care,
            "recommended_tests": treatment['tests'] if treatment['tests'] else ["Basic vitals"],
            "follow_up": "48 hours" if severity == 'High' else "1 week",
            "recommended_action": recommended_action,
            "clinical_reasoning": clinical_reasoning,
            "confidence": conf
        }
        results.append(res)

    results = simulate_bias(results, settings)
    analysis_results = results
    
    return jsonify({
        "results": analysis_results,
        "bias_score": round(bias_score, 1)
    })

@app.route('/fix-bias', methods=['POST'])
def fix_bias():
    global analysis_results, bias_score
    if not analysis_results:
        return jsonify({"error": "No analysis data to fix."}), 400

    bias_score = random.uniform(1.0, 5.0) # Reduce bias
    for res in analysis_results:
        res['confidence'] = get_base_confidence(res['patient']['age'], res['risk_level'].split()[0])
        # Revert age bias logically
        if int(res['patient']['age']) > 65:
            res['treatment_plan'] = generate_treatment_plan(int(res['patient']['age']), "None")
            res['clinical_reasoning'] = "Standardized protocol applied uniformly regardless of age."

    return jsonify({
        "message": "Bias Successfully Reduced",
        "results": analysis_results,
        "bias_score": round(bias_score, 1)
    })

@app.route('/remove-patient', methods=['POST'])
def remove_patient():
    global patients, analysis_results
    data = request.json
    index = data.get('index')
    
    if index is not None:
        idx = int(index)
        if 0 <= idx < len(patients):
            patients.pop(idx)
            # Remove from analysis_results if length matches directly
            if len(analysis_results) > idx:
                analysis_results.pop(idx)
            return jsonify({"message": "Patient removed", "patients": patients})
            
    return jsonify({"error": "Invalid index or patient not found"}), 400

@app.route('/get-settings', methods=['GET'])
def get_settings():
    return jsonify(settings)

@app.route('/update-settings', methods=['POST'])
def update_settings():
    global settings
    data = request.json
    settings.update(data)
    return jsonify({"message": "Settings updated", "settings": settings})

@app.route('/reset-settings', methods=['POST'])
def reset_settings():
    global settings
    settings = default_settings.copy()
    return jsonify({"message": "Settings reset", "settings": settings})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
