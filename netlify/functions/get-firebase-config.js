exports.handler = async function(event, context) {
  // Netlify 환경 변수에서 설정 값을 읽어옴
  const firebaseConfig = process.env.FIREBASE_CONFIG;

  if (!firebaseConfig) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Firebase config not found on server." }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    // JSON 문자열을 다시 객체로 파싱해서 전달
    body: JSON.stringify(JSON.parse(firebaseConfig)),
  };
};
