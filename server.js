const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.post('/correct', async (req, res) => {
  const { apiKey, model, apiUrl, indexed, cmd } = req.body;

  // 生成拼音輔助資訊
  const getPinyin = (text) => pinyin(text, { toneType: 'num' });
  
  // 從 indexed 格式 "[0:我][1:的]" 提取純文字並轉拼音
  const extractAndPinyin = (indexedStr) => {
    const matches = indexedStr.match(/\[(\d+):(.+?)\]/g) || [];
    return matches.map(m => {
      const match = m.match(/\[(\d+):(.+?)\]/);
      const idx = match[1];
      const char = match[2];
      return `[${idx}:${getPinyin(char)}]`;
    }).join('');
  };

  const cmdPinyin = getPinyin(cmd);
  const indexedPinyin = extractAndPinyin(indexed);

  const userContent = `【暫存區】
${indexed}

【修正描述】
${cmd}

【語音輔助資訊（供發音比對參考）】
- 修正描述拼音：${cmdPinyin}
- 暫存區拼音：${indexedPinyin}`;

  let systemPrompt;
  try {
    systemPrompt = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
  } catch (e) {
    return res.status(500).json({ error: 'prompt.txt 讀取失敗：' + e.message });
  }

  const tools = [
    {
      type: "function",
      function: {
        name: "replace",
        description: "替換暫存區中一段連續的字（含刪除）。刪除時將 new_text 設為空字串。",
        parameters: {
          type: "object",
          properties: {
            start_index: { type: "integer", description: "起始字元的 index（含）" },
            end_index: { type: "integer", description: "結束字元的 index（含）" },
            new_text: { type: "string", description: "新的文字，刪除時填空字串" }
          },
          required: ["start_index", "end_index", "new_text"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "insert",
        description: "在特定 index 位置前插入文字",
        parameters: {
          type: "object",
          properties: {
            index: { type: "integer", description: "插入位置的 index（插在該 index 之前）" },
            text: { type: "string", description: "要插入的文字" }
          },
          required: ["index", "text"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "swap",
        description: "交換兩個 index 的字的位置",
        parameters: {
          type: "object",
          properties: {
            index_a: { type: "integer", description: "第一個字的 index" },
            index_b: { type: "integer", description: "第二個字的 index" }
          },
          required: ["index_a", "index_b"]
        }
      }
    }
  ];

  try {
    const endpoint = apiUrl || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        tools,
        tool_choice: 'required'
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    const calls = toolCalls.map(tc => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments)
    }));

    res.json({ calls, debug: { cmdPinyin, indexedPinyin } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('server running at http://localhost:3000'));