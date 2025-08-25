// api/search.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cheerio = require('cheerio');

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  if (!GEMINI_API_KEY) {
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'サーバーエラー: Gemini APIキーが設定されていません。' })
    };
  }

  try {
    const { userQuery } = JSON.parse(event.body);
    if (!userQuery) {
      return { statusCode: 400, body: 'Query is missing' };
    }

    // --- AIフェーズ1: DLsite検索用のキーワードを生成 ---
    const prompt1 = `ユーザーの曖昧な記憶から、DLsiteの検索で使うためのキーワードを5つ以内で生成し、スペース区切りで出力してください。記憶: "${userQuery}"`;
    const keywordResult = await model.generateContent(prompt1);
    const searchKeywords = keywordResult.response.text().trim();
    
    // --- Webスクレイピングで作品を検索 ---
    const searchUrl = `https://www.dlsite.com/maniax/fsr/=/language/jp/keyword/${encodeURIComponent(searchKeywords)}/per_page/15/sort/trend/order/desc`;

    const response = await fetch(searchUrl, {
      headers: {
        // ★★★ ブラウザからのアクセスに偽装する ★★★
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
        throw new Error(`DLsiteへのアクセスに失敗しました: ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const scrapedProducts = [];
    $('tr._work').each((i, element) => {
        const product_name = $(element).find('.work_name a').text().trim();
        const affiliate_url = $(element).find('.work_name a').attr('href');
        const thumbnail_url = 'https:' + $(element).find('.work_thumb img').attr('src');
        const maker_name = $(element).find('.maker_name a').text().trim();
        const product_id = affiliate_url ? new URL(affiliate_url).pathname.split('/').pop() : null;

        if (product_id) {
            scrapedProducts.push({ product_id, product_name, maker_name, thumbnail_url, affiliate_url });
        }
    });

    if (scrapedProducts.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: "作品が見つかりませんでした。" }) };
    }

    // --- AIフェーズ2: スクレイピング結果をユーザーの記憶と照合し、ランキング付け ---
    const prompt2 = `ユーザーの記憶とDLsiteの作品リストを比較し、最も一致度が高いと思われる作品を最大5つまで選んでください。各作品に一致度(score)と理由(reason)を追加したJSON配列で出力してください。
# ユーザーの記憶:
"${userQuery}"
# DLsite作品リスト:
${JSON.stringify(scrapedProducts)}
# 出力形式 (JSON配列のみ):
[
  { "product_id": "RJ123456", "score": 95, "reason": "記憶にある「キーワード」がタイトルと説明文に含まれています。" }
]`;
    
    const rankingResult = await model.generateContent(prompt2);
    const rankedItems = JSON.parse(rankingResult.response.text().trim().replace(/```json/g, '').replace(/```/g, ''));
    
    const finalResults = rankedItems.map(rankedItem => {
        const originalItem = scrapedProducts.find(p => p.product_id === rankedItem.product_id);
        return {
            ...originalItem,
            score: rankedItem.score,
            reason: rankedItem.reason
        };
    }).sort((a, b) => b.score - a.score);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalResults),
    };

  } catch (error) {
    console.error(error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `An error occurred: ${error.message}`, stack: error.stack })
    };
  }
};
