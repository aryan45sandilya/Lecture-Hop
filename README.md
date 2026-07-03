<div align="center">

# 🎓 Lecture Hop

**AI-powered YouTube playlist sequencer — learn in the right order, every time.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](LICENSE)

</div>

---

## ✨ What is Lecture Hop?

Lecture Hop takes any YouTube educational playlist and **resequences it into the optimal learning order** using AI-driven curriculum analysis.

Most playlists are uploaded in the order they were recorded — not the order you should *learn* them. Lecture Hop fixes that.

### How it works

```
YouTube URL  →  AI Analysis  →  Semantic Clustering  →  Prereq Graph  →  Optimal Sequence
```

| Step | What happens |
|------|-------------|
| 🔍 **Transcript Extraction** | Pulls and segments lecture content into chunks |
| 🧠 **Vector Embeddings** | Generates 384-dim semantic vectors per segment |
| 🗂 **HDBSCAN Clustering** | Groups segments into dense, cohesive topic clusters |
| 🔗 **Prerequisite Mapping** | LLM validates pairwise topic dependencies |
| 📊 **Topological Sort** | Orders topics via Kahn's algorithm |
| ⚠️ **Gap Detection** | Flags missing foundational concepts that block learning |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20+
- A [Groq API key](https://console.groq.com) (free)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/lecture-hop.git
cd lecture-hop

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Add your GROQ_API_KEY to .env

# 4. Start the API server (Terminal 1)
npm run dev:api:build
npm run dev:api

# 5. Start the frontend (Terminal 2)
npm run dev:ui
```

Open **http://localhost:5173** in your browser.

---

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key_here
APP_URL=http://localhost:3001
```

> ⚠️ **Never commit your `.env` file.** It's in `.gitignore` by default.

Get a free Groq API key at [console.groq.com](https://console.groq.com) — no credit card required.

---

## 📁 Project Structure

```
lecture-hop/
├── src/
│   ├── App.tsx          # Main React UI
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles
├── server.ts            # Express API + AI pipeline
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript config (frontend)
├── tsconfig.server.json # TypeScript config (backend)
├── package.json         # Dependencies & scripts
└── .env.example         # Environment template
```

---

## 🛠 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api:build` | Compile server TypeScript → JS |
| `npm run dev:api` | Start Express API server on port 3001 |
| `npm run dev:ui` | Start Vite dev server on port 5173 |
| `npm run build` | Production build (frontend + backend) |
| `npm run start` | Run production server |

---

## 🎨 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| **Backend** | Node.js, Express, TypeScript |
| **AI** | Groq API (llama-3.3-70b-versatile) |
| **Build** | Vite 6, esbuild, tsx |
| **Icons** | Lucide React |

---

## 📸 Screenshots

> Drop your screenshots here after first run!

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

---

## 📄 License

[Apache 2.0](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ using React, Express & Groq AI</sub>
</div>
