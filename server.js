const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.post('/correct', async (req, res) => {
  const { apiKey, model, indexed, cmd } = req.body;

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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `暫存區：${indexed}\n修正描述：${cmd}` }
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

    res.json({ calls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('server running at http://localhost:3000'));