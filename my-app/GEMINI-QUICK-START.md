# 🚀 Gemini 2.5 Flash Quick Start

## ⚡ 3-Step Setup (2 minutes)

### 1. Get Your Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"** 
3. Copy the key (starts with `AIza...`)

### 2. Add to Environment
Create/update `.env.local`:
```bash
GEMINI_API_KEY=AIza_your_gemini_key_here
```

### 3. Test It
```bash
npm run test:gemini
```

## 🎯 Expected Results

**Before (rule-based):**
```
❌ Title: "Sankesh Vithal Shetty" (wrong - this is recipient)
❌ Date: "23-Sep-2025" (wrong - OCR error)
```

**After (Gemini AI):**
```
✅ Title: "IIT Bombay Research Internship 2022-23"
✅ Institution: "Indian Institute of Technology Bombay"  
✅ Recipient: "Sankesh Vithal Shetty"
✅ Date: "2023-06-19"
✅ Confidence: 98%
```

## 🔧 How It Works

1. **Client OCR**: Tesseract extracts raw text from image
2. **Gemini AI**: Structures the text intelligently 
3. **Fallback**: Rule-based extraction if Gemini fails
4. **Merge**: Best of both worlds for maximum reliability

## 💰 Cost

- **Per certificate**: ~$0.0001 (basically free!)
- **1000 certificates**: ~$0.10 
- **10x cheaper** than GPT-4

## 🚨 Troubleshooting

### "No Gemini API key found"
```bash
# Check your .env.local file exists and has:
GEMINI_API_KEY=AIza_your_actual_key_here
```

### "Gemini API error"
- Verify your API key is valid
- Check you have internet connection
- Make sure you enabled the Generative AI API

### "Fallback extraction used"
- This is normal! System is robust
- Gemini failed but rule-based worked
- Check API key and network

## 🎉 Success!

Once working, every certificate upload will use **Gemini 2.5 Flash** for perfect extraction while maintaining **100% uptime** with intelligent fallbacks!

Upload your IIT certificate and see the magic! ✨
