import os
import json
# import requests  # APIを使わないので不要
# import google.generativeai as genai # APIを使わないので不要

def handler(event, context):
    if event['httpMethod'] != 'POST':
        return {
            'statusCode': 405,
            'body': json.dumps({'error': 'Method Not Allowed'})
        }

    # --- 本来APIキーを取得する部分 (今は不要) ---
    # GEMINI_API_KEY = os.environ.get('GOOGLE_GEMINI_API_KEY')
    # DMM_API_ID = os.environ.get('DMM_API_ID')
    # DMM_AFFILIATE_ID = os.environ.get('DMM_AFFILIATE_ID')
    
    # if not all([GEMINI_API_KEY, DMM_API_ID, DMM_AFFILIATE_ID]):
    #     # 実際にはここでエラーを返すが、今回はダミーデータを返す
    #     print("API keys are not set. Returning dummy data.")

    try:
        # ★★★ ここからが修正箇所 ★★★
        # DMM APIやGemini APIへの接続はすべて行わず、
        # 固定のダミーデータを返すようにする。
        dummy_data = [
            {
                "title": "【サンプル1】ショートヘアの新人OL",
                "affiliateURL": "#",
                "imageURL": {"large": "https://via.placeholder.com/200x300.png?text=Sample+1"},
                "iteminfo": {
                    "actress": [{"name": "田中みな実 (サンプル)"}],
                },
                "score": 95,
                "reason": "ユーザーの記憶とシチュエーションが完全に一致します。"
            },
            {
                "title": "【サンプル2】出張先の温泉旅館",
                "affiliateURL": "#",
                "imageURL": {"large": "https://via.placeholder.com/200x300.png?text=Sample+2"},
                "iteminfo": {
                    "actress": [{"name": "新木優子 (サンプル)"}],
                },
                "score": 80,
                "reason": "「出張」と「旅館」の要素が含まれています。"
            }
        ]
        
        return {
            'statusCode': 200,
            'headers': { 'Content-Type': 'application/json' },
            'body': json.dumps(dummy_data, ensure_ascii=False)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'An error occurred: {str(e)}'})
        }