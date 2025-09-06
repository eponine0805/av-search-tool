// netlify/functions/search.js

// --- 定数定義 ---
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const SOKMIL_API_BASE_URL = 'https://sokmil-ad.com/api/v1';
const SOKMIL_REQUEST_TIMEOUT = 8000; // 8秒

// --- 環境変数 ---
const {
  GOOGLE_GEMINI_API_KEY: GEMINI_API_KEY,
  SOKMIL_API_KEY,
  SOKMIL_AFFILIATE_ID,
} = process.env;


/**
 * Gemini API (JSONモード) を呼び出すヘルパー関数
 * @param {string} prompt - Geminiに送信するプロンプト
 * @returns {Promise<string>} GeminiからのJSON応答テキスト
 * @throws {Error} APIリクエストが失敗した場合
 */
async function callGeminiApi(prompt) {
  const requestBody = {
    contents: [{
      parts: [{ text: prompt }],
    }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})); // JSONパース失敗時は空オブジェクト
      console.error("Gemini API Error:", { status: response.status, data: errorData });
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // エラーを再スローして、呼び出し元で処理できるようにする
    throw error;
  }
}

/**
 * Netlify Functionのメインハンドラ
 * @param {object} event - Netlifyから渡されるイベントオブジェクト
 * @returns {Promise<object>} HTTPレスポンスオブジェクト
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };
  }

  try {
    const { userQuery, type } = JSON.parse(event.body);
    let responseData;

    switch (type) {
      case 'dmm':
        responseData = await generateDmmResults(userQuery);
        break;
      case 'sokmil':
        responseData = await searchSokmil(userQuery);
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: '無効な検索タイプです。' })
        };
    }

    // 結果がない場合のメッセージを付与
    if (!responseData.results || responseData.results.length === 0) {
      responseData.message = "作品が見つかりませんでした。";
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error("Handler Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `サーバー内部でエラーが発生しました: ${error.message}` }),
    };
  }
};

/**
 * Sokmil APIを検索し、関連性の高い順にソートして結果を返す
 * @param {string} userQuery - ユーザーからの検索クエリ
 * @returns {Promise<object>} 検索結果と使用したキーワードを含むオブジェクト
 * @throws {Error} 検索処理中にエラーが発生した場合
 */
async function searchSokmil(userQuery) {
  const searchQuery = userQuery || "新人";
  
  // 1. Gemini APIで検索キーワードを生成
  const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使う日本語の名詞または形容詞を1~3つまで抽出し、さらに追加で文章から類推される単語を2つ生成し、JSON配列の形式（例: ["キーワード1", "キーワード2"]）で出力してください。解説やMarkdownは一切含めないでください。単語が、Googleのセーフティ機能に抵触しそうな場合はキーワードに含めないでください。文章: "${searchQuery}"`;
  const resultText = await callGeminiApi(keywordPrompt);

  if (!resultText) {
    console.warn("Gemini API returned an empty response.");
    return { results: [], keywords: [] };
  }

  const refinedKeywords = JSON.parse(resultText);
  if (!Array.isArray(refinedKeywords) || refinedKeywords.length === 0) {
