import os
import json
import google.generativeai as genai

# 使用するAPIキーはGeminiのものだけ
GEMINI_API_KEY = os.environ.get('GOOGLE_GEMINI_API_KEY')

# Geminiモデルを初期化
# キーが設定されていない場合は、エラーを返すようにする
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
else:
    model = None

def handler(event, context):
    if event['httpMethod'] != 'POST':
        return {'statusCode': 405, 'body': json.dumps({'error': 'Method Not Allowed'})}

    # Gemini APIキーが設定されていない場合は、エラーメッセージを返す
    if not model:
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'サーバーエラー: Gemini APIキーが設定されていません。'})
        }

    try:
        body = json.loads(event['body'])
        user_query = body.get('userQuery')
        if not user_query:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Query is missing'})}

        # ★★★ Geminiに対する指示（プロンプト）を修正 ★★★
        # DMM検索は行わず、Geminiに架空の作品リストを生成させる
        prompt = f"""
          あなたは非常に優秀なAV作品の検索エンジンです。
          以下のユーザーの曖昧な記憶を元に、それに合致しそうな架空のAV作品のリストを3つ生成してください。

          # ユーザーの記憶:
          "{user_query}"

          # 出力ルール:
          - 必ずJSON配列形式で出力してください。
          - 各作品には以下のキーを含めてください: title, affiliateURL, imageURL, iteminfo, score, reason
          - 'title': 記憶に沿った架空の作品タイトルを創作してください。
          - 'affiliateURL': "#" という固定文字列にしてください。
          - 'imageURL': {{ "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" }} という固定のオブジェクトにしてください。
          - 'iteminfo': {{ "actress": [{{"name": "架空の女優名"}}] }} という形式で、架空の女優名を創作してください。
          - 'score': ユーザーの記憶との一致度を0〜100の数値で評価してください。
          - 'reason': なぜその作品が一致すると考えたか、簡潔な理由を述べてください。
          
          # 出力形式 (JSON配列のみを出力):
          [
            {{
              "title": "架空のタイトル1", "affiliateURL": "#",
              "imageURL": {{ "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" }},
              "iteminfo": {{ "actress": [{{"name": "架空 愛子"}}] }},
              "score": 98, "reason": "「OL」と「出張」の要素が完全に一致します。"
            }}
          ]
        """
        
        response = model.generate_content(prompt)
        # AIの出力をパースしやすいように整形
        result_text = response.text.strip().replace('```json', '').replace('```', '')
        final_results = json.loads(result_text)
        
        return {
            'statusCode': 200,
            'headers': { 'Content-Type': 'application/json' },
            'body': json.dumps(final_results, ensure_ascii=False)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'An error occurred: {str(e)}'})
        }