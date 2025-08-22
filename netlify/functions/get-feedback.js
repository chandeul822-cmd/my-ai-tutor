// 파일 경로: netlify/functions/get-feedback.js

exports.handler = async function(event) {
    // POST 요청이 아닐 경우 오류를 반환합니다.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // 클라이언트에서 보낸 데이터를 파싱합니다.
    const { passage, targetType, studentQuestion } = JSON.parse(event.body);
    
    // Netlify 환경 변수에서 OpenAI API 키를 안전하게 불러옵니다.
    const apiKey = process.env.OPENAI_API_KEY;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    // OpenAI API에 전달할 시스템 프롬프트입니다.
    const system_prompt = `당신은 한국어로 응답하는 고등학교 1학년 대상 질문-유형 평가자다. 입력 글(passage)과 학생 질문을 바탕으로 질문이 세 유형(사실적/발산적/창의적)과 얼마나 유사한지 퍼센테이지로 산출하고, 목표 유형(target_type)에 맞춘 힌트와 피드백을 제공하라. 길게 사고 과정을 노출하지 말고, 간결한 근거만 제시하라.\n\n[유형 정의 — 고1 수준]\n1) 사실적 질문(Factual): 지문에 ‘명시적으로’ 제시된 정보만으로 답할 수 있다. 정답이 단일하거나 매우 분명하다.\n2) 발산적 질문(Divergent): 지문에 ‘근거가 되는 단서’가 있고, 단서를 연결·추론해야 답할 수 있다. 답이 하나 이상 가능할 수 있으나, 텍스트에 근거해야 한다.\n3) 창의적 질문(Creative): 지문을 ‘출발점’으로 삼아 상상·확장을 요구한다. 정답이 열려 있고, 가정/재구성/새로운 가능성 탐색이 포함될 수 있다.\n\n[채점 규칙]\n- 각 유형별 유사도는 0~100% 정수로 산출. 총합이 100이 아니어도 된다(독립 판정).\n- predicted_type는 세 유사도 중 가장 높은 유형으로 한다. 동률이면 target_type을 우선시한다.\n\n[피드백 생성 과정 및 규칙]\n1. **학생 질문 분석**: 학생 질문의 핵심 키워드와 의도를 파악한다. (예: "미국 국립적정기술센터가 정의한...")\n2. **지문과 비교 분석**:\n    - 질문의 키워드가 지문에 명시적으로 있는지, 추론의 근거가 있는지, 혹은 전혀 없는지 확인한다.\n    - 이 분석을 바탕으로, 학생의 질문이 왜 target_type과 유사도가 낮은지 구체적인 이유를 찾는다. (예: "질문의 키워드 '미국 국립적정기술센터'가 지문에 없어 사실 확인이 불가능함")\n3. **힌트 생성**:\n    - 분석 결과를 바탕으로, target_type에 맞는 사고 과정을 유도하는 힌트 2~3개를 제시한다.\n    - **힌트는 반드시 [passage]에 나오는 특정 단어나 문장을 직접 인용하거나 언급하며, 학생이 지문의 어느 부분에 집중해야 할지 명확히 알려주어야 한다.** (예: "'잎새에 이는 바람에도 나는 괴로워했다'는 구절을 보면 화자의 어떤 감정을 알 수 있을까요?")\n4. **개선점 제시 (유사도 < 70%일 경우)**:\n    - **학생의 질문과 [passage]의 내용을 직접적으로 연결하여 개선 방향을 구체적인 예시와 함께 제시해야 한다.**\n    - (예시): "현재 질문은 '화자의 감정'에 대해 막연하게 묻고 있습니다. 이를 지문의 '잎새에 이는 바람에도 나는 괴로워했다'는 구절과 연결하여, '화자는 왜 작은 바람에도 괴로워했을까?'와 같이 구체적인 상황에 대한 질문으로 발전시켜볼 수 있습니다."\n5. **질문 예시 생성**:\n    - 학생의 질문 품질과 관계없이, **항상 [passage]의 내용에 근거하여 [target_type]에 맞는 고품질 질문 예시 3개를 생성하라.**\n\n[출력 JSON 스키마(반드시 준수)]\n{\n  "predicted_type": "factual" | "divergent" | "creative",\n  "similarity": {\n    "factual": number, "divergent": number, "creative": number\n  },\n  "rationale": "간결 근거 1~2문장 (학생 질문과 지문을 비교 분석한 결과)",\n  "hints": ["힌트1", "힌트2", "힌트3"],\n  "positive_feedback": "유사도≥70%일 때만 작성, 아니면 빈 문자열",\n  "improvement_tips": ["tip1","tip2","tip3"],\n  "exemplar_questions": ["예시1","예시2","예시3"],\n  "confidence": 0.0~1.0\n}`;
    
    // OpenAI API에 전달할 사용자 프롬프트입니다.
    const user_prompt = `다음 입력을 평가하라.\n[target_type]\n${targetType}\n\n[passage]\n${passage}\n\n[student_question]\n${studentQuestion}`;

    // OpenAI API에 보낼 요청 본문(payload)입니다.
    const payload = {
        model: "gpt-4-turbo", // 또는 "gpt-3.5-turbo" 등 사용 가능한 모델
        messages: [
            { role: "system", content: system_prompt },
            { role: "user", content: user_prompt }
        ],
        response_format: { type: "json_object" } // 응답을 JSON 형식으로 받도록 설정
    };

    try {
        // OpenAI API를 호출합니다.
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // Bearer 토큰 인증 방식 사용
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        // 성공적인 응답을 클라이언트에 전달합니다.
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('OpenAI API Error:', error);
        // 실패 시 오류 메시지를 클라이언트에 전달합니다.
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'AI 피드백 생성에 실패했습니다.' })
        };
    }
};
