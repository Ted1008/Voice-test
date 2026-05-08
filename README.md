# Voice-test — 語音輸入後處理修正 Sandbox

## 專案背景與目標

這是一個語音輸入（STT）後處理系統的 **概念驗證 Sandbox**。

語音辨識模型（如 Whisper）的輸出常出現同音異字錯誤，例如「滷肉飯」被辨識成「魯肉飯」。傳統的字串替換無法處理這類問題，因為使用者的修正指令本身也是透過語音辨識輸入的，同樣可能有誤。

### 核心設計理念

本專案採用雙模型架構：

```
使用者說話
    │
    ▼
[STT 模型 / Whisper]
    │ 輸出初步辨識文字（可能有同音錯字）
    ▼
暫存區（Indexed Buffer）
    │
使用者說修正指令（也經過 STT，也可能有誤）
    │
    ▼
[Second LLM]  ←── 暫存區內容 + 修正描述 + Tool 定義
    │ 輸出 function call
    ▼
執行 Tool → 更新暫存區
    │
使用者確認 → Commit 進正文
```

**關鍵設計**：暫存區內部以字元 index 標記每個字（`[0:我][1:想][2:吃]`），讓 LLM 能精確定位操作目標，繞開 LLM 不擅長「數字元」的天生弱點。

---

## 目前實作範圍

這個 repo 是純粹的 **Sandbox 測試工具**，用來驗證 LLM + Tool Calling 的修正邏輯是否可行。

- ✅ 暫存區的 indexed 結構與字元操作
- ✅ LLM function calling 驅動的修正引擎
- ✅ 多模型切換測試（OpenAI 各版本）
- ✅ Prompt 調教與 few-shot 範例
- ✅ 拼音輔助資訊（`feature/pinyin-mapping` branch）
- ❌ 真實 STT 語音輸入（尚未接入，目前用手動文字模擬）
- ❌ 正文 Commit 後的編輯（暫不在範圍內）

---

## 檔案結構

```
Voice-test/
├── index.html       # 前端 Sandbox UI（無後端純靜態應用）
├── prompt.txt       # LLM System Prompt（由前端 fetch 即時讀取）
├── package.json
└── README.md
```

---

## 快速開始

### 前置需求

- 一個可以提供靜態網頁伺服器的環境（例如 `npx serve` 或 VSCode Live Server）
- OpenAI API Key（需支援 function calling 的模型）

### 安裝與啟動

```bash
git clone https://github.com/Ted1008/Voice-test.git
cd Voice-test
npx serve .
```

瀏覽器開啟對應的本機地址（通常是 `http://localhost:3000`）。

### 使用方式

1. 在頂部貼上 OpenAI API Key
2. 選擇要測試的模型
3. 輸入或選擇範例句子，按「載入」
4. 輸入修正描述（模擬 STT 輸出），按「送出修正」
5. 觀察 log 區的 function call 和執行結果

---

## 架構細節

### 暫存區（Indexed Buffer）

前端將每個字元切割並標上 index：

```
「我想吃魯肉飯」→ [0:我][1:想][2:吃][3:魯][4:肉][5:飯]
```

這個格式直接送給 LLM，讓它在 function call 裡使用精確的 index，而不是模糊的字串匹配。

每次 tool 執行後，會重新打散成單字元 token，確保 index 永遠對應單一字元。

### Tool 定義

LLM 可以呼叫以下 function：

| Tool | 參數 | 說明 |
|------|------|------|
| `replace` | `start_index`, `end_index`, `new_text` | 替換一段連續字元，`new_text` 為空字串時等同刪除 |
| `insert` | `index`, `text` | 在指定位置前插入文字 |
| `swap` | `index_a`, `index_b` | 交換兩個字元的位置 |

> `delete` 已廢棄，統一改用 `replace` + 空字串處理，避免模型混用造成 index 偏移問題。

### 多個 Tool Call 的執行順序

當 LLM 回傳多個 function call 時，前端會**由後往前排序**執行（依 index 降序），避免先執行前面的操作導致後面的 index 位移。

### Prompt 即時更新

`prompt.txt` 在每次 API 請求時即時讀取，修改後直接生效，不需重啟 server。這讓 prompt 調教變得非常快速。

---

## 模型選擇與測試結論

目前測試過以下模型，針對「成語描述同音字」這個最難 case（例如「王改成亡羊補牢的亡」）的結果：

| 模型 | 一般同音字修正 | 成語描述定位 | 備註 |
|------|-------------|------------|------|
| gpt-5-nano | ❌ | ❌ | 直接把整個描述塞進暫存區 |
| gpt-5-mini | ⚠️ | ❌ | 理解任務結構但推理不足 |
| gpt-4o-mini | ⚠️ | ❌ | 容易產生多餘操作 |
| gpt-4.1-mini | ✅ | ❌ | 一般修正穩定，成語推理失敗 |
| gpt-4.1 | ✅ | ✅ | 目前唯一通過所有測試的模型 |

**現況**：成語描述定位屬於多步推理任務，mini 等級模型尚無法穩定處理。日常同音字修正用 `gpt-4.1-mini` 已足夠。

---

## feature/pinyin-mapping branch

此 branch 在送給 LLM 的 prompt 中額外附上拼音輔助資訊：

```
【語音輔助資訊（供發音比對參考）】
- 修正描述拼音：wang2 gai3 cheng2 wang2 yang2 bu3 lao2 de5 wang2
- 暫存區拼音：[0:ta1][1:jiao4][2:wang2][3:da4][4:ming2]
```

**動機**：LLM 對中文字的「讀音」理解不穩定，直接提供拼音可以讓模型做更可靠的音近比對，不需要靠它自己推斷發音。

**依賴**：需額外安裝 `pinyin-pro`：

```bash
npm install pinyin-pro --save
```

**測試結論**：加入拼音輔助後，`gpt-5.4-nano` 在部分成語 case 可以正確處理，但尚未全面驗證穩定性。

---

## 已知限制與未來方向

### 已知限制

- **STT 尚未接入**：目前所有測試都是手動輸入文字模擬 STT 輸出，真實場景的錯誤分佈可能與測試假設不同
- **成語描述 mini 模型不穩定**：需要較強推理能力的模型
- **正文不支援 LLM 修正**：Commit 進正文後只能手動 UI 操作

### 下一步方向

- 接入 Whisper API 或本地 faster-whisper 做真實 STT 測試
- 評估 Anthropic Claude Haiku 作為 second model 的可行性
- 雙按鈕 UI 設計（輸入模式 / 指令模式分離）
- 手機端部署評估

---

## Prompt 調教紀錄

`prompt.txt` 是這個專案最核心的調教對象，目前包含：

- **思考步驟**：要求 LLM 先推斷目標句，再做最小 diff，最後呼叫 tool
- **容錯匹配規則**：修正描述和暫存區都可能有 STT 誤辨，要交叉比對
- **成語/詞組定位規則**：從成語中找音近字作為目標
- **六個 few-shot 範例**：涵蓋同音字、範圍替換、刪除、成語定位等情境

修改 `prompt.txt` 不需重啟 server，直接存檔後送出下一個請求即生效。
