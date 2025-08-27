// netlify/functions/search.js

// --- 環境変数 ---
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID;

/**
 * Gemini APIを直接呼び出すためのヘルパー関数
 * @param {string} prompt Geminiに送信するプロンプト文字列
 * @returns {Promise<string>} Geminiからのテキスト応答
 */
async function callGeminiApi(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    // ▼▼▼ この部分を追加 ▼▼▼
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error;
  }
}


  try {
    const response = await fetch(url, {
      method: 'POST', // curlの`-X POST`に相当
      headers: {
        // curlの`-H`（ヘッダー）に相当
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // APIからの生のレスポンスは階層が深いため、必要なテキスト部分を抽出して返す
    // (レスポンスがない場合のエラーハンドリング)
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error; // エラーを呼び出し元に再スローする
  }
}


/**
 * Netlify Functionのメインハンドラ
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { userQuery, type } = JSON.parse(event.body);
    let responseData = {};

    if (type === 'dmm') {
      responseData = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
      responseData = await searchSokmil(userQuery);
    } else {
      return { statusCode: 400, body: JSON.stringify({ message: '無効な検索タイプです。' }) };
    }

    if (!responseData.results || responseData.results.length === 0) {
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: "作品が見つかりませんでした。", keywords: responseData.keywords || [] }) 
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
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
 * Sokmil APIを検索し、関連性の高い順に結果を返す
 */
async function searchSokmil(keyword) {
  try {
    const searchQuery = keyword || "新人";
    
    // ▼▼▼ AIへの指示（prompt）をJSON配列を要求するように変更 ▼▼▼
    const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使う日本語の名詞または形容詞を1~5つまで抽出し、JSON配列の形式（例: ["キーワード1", "キーワード2"]）で出力してください。解説やMarkdownは一切含めないでください。文章: "${searchQuery}"`;

    // 「JSONモード」が有効なcallGeminiApiを呼び出す
    const resultText = await callGeminiApi(keywordPrompt);

    // ▼▼▼ 返ってきたJSON文字列をパースしてキーワード配列を取得 ▼▼▼
    const refinedKeywords = JSON.parse(resultText);

    if (!refinedKeywords || refinedKeywords.length === 0) {
      return { results: [], keywords: [] };
    }

    // (以降のSokmil API検索ロジックは変更なし)
    const searchPromises = refinedKeywords.map(async (kw) => {
      // ... (この部分は変更ありません)
    });
    
    const allResults = await Promise.all(searchPromises);
    // ... (この部分も変更ありません)

    return { results: finalResults, keywords: refinedKeywords };

  } catch (e) {
    console.error("Sokmil search failed:", e);
    throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
  }
}


/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    const prompt = `以下の文章から検索に使う日本語の名詞または形容詞を1~5つまで抽出し、スペース区切りで出力してください。そしてそれに合致しそうな架空のDMM作品のリストを3つ生成してください。記憶: "${queryForAI}" 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason`;

    // 修正点: ライブラリの代わりに新しく作成したcallGeminiApi関数を使用
    const responseText = await callGeminiApi(prompt);
    
    if (!responseText) {
      return { results: [], keywords: [queryForAI] };
    }

    const cleanedText = responseText.trim().replace(/^```json\s*|```\s*$/g, '');
    const finalResults = JSON.parse(cleanedText);
    
    return { results: finalResults, keywords: [queryForAI] };

  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
