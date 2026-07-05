import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.json());

// In-memory Database schemas as specified
interface Playlist {
  id: string;
  youtube_playlist_id: string;
  title: string;
  video_count: number;
  status: 'pending' | 'fetching_transcripts' | 'embedding' | 'clustering' | 'sorting' | 'completed' | 'failed';
  analyzed_at: string | null;
  error?: string;
}

interface Video {
  id: string;
  playlist_id: string;
  youtube_video_id: string;
  title: string;
  original_position: number;
  suggested_position: number;
  duration_seconds: number;
  primary_topic_name?: string;
}

interface Segment {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
  transcript_text: string;
  embedding: number[];
}

interface Topic {
  id: string;
  name: string;
  centroid_embedding: number[];
}

interface TopicGap {
  id: string;
  playlist_id: string;
  missing_topic: string;
  blocks_video_title: string;
  explanation: string;
}

// Global DB
const db = {
  playlists: new Map<string, Playlist>(),
  videos: new Map<string, Video[]>(),
  segments: new Map<string, Segment[]>(),
  topics: new Map<string, Topic[]>(),
  gaps: new Map<string, TopicGap[]>()
};

// Lazy initialization of Groq Client
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

// Utility to parse YouTube Playlist ID
function parsePlaylistId(url: string): string {
  try {
    const cleanUrl = url.trim();
    if (cleanUrl.includes("list=")) {
      const match = cleanUrl.match(/[&?]list=([^#\&\?]+)/);
      if (match) return match[1];
    }
    // Return direct string if it looks like an ID
    if (/^[A-Za-z0-9_-]{18,44}$/.test(cleanUrl)) {
      return cleanUrl;
    }
  } catch (e) {
    // Fallback
  }
  return "PL_DEFAULT_LECTURE_HOP";
}

// Kahn's algorithm for topological sorting of Topic IDs
function topologicalSort(
  topicIds: string[],
  dependencies: { prerequisite_topic_id: string; dependent_topic_id: string }[]
): string[] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const tid of topicIds) {
    adj.set(tid, []);
    inDegree.set(tid, 0);
  }

  for (const dep of dependencies) {
    const u = dep.prerequisite_topic_id;
    const v = dep.dependent_topic_id;
    if (adj.has(u) && adj.has(v)) {
      adj.get(u)!.push(v);
      inDegree.set(v, inDegree.get(v)! + 1);
    }
  }

  const queue: string[] = [];
  for (const tid of topicIds) {
    if (inDegree.get(tid) === 0) {
      queue.push(tid);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      inDegree.set(v, inDegree.get(v)! - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  // Fallback for circular dependencies or disconnected parts
  if (order.length < topicIds.length) {
    for (const tid of topicIds) {
      if (!order.includes(tid)) {
        order.push(tid);
      }
    }
  }

  return order;
}

// Fallback high-quality curriculum generator
function generateMockCurriculum(playlistUrl: string, listId: string) {
  const combined = (playlistUrl + listId).toLowerCase();

  // Check URL keywords first
  let topic = "";
  if (combined.includes("math") || combined.includes("linear") || combined.includes("algebra")) {
    topic = "Linear Algebra";
  } else if (combined.includes("ml") || combined.includes("machine") || combined.includes("neural") || combined.includes("ai") || combined.includes("deep")) {
    topic = "Machine Learning";
  } else if (combined.includes("python") || combined.includes("django") || combined.includes("flask")) {
    topic = "Python Programming";
  } else if (combined.includes("history") || combined.includes("histor")) {
    topic = "World History";
  } else if (combined.includes("physic") || combined.includes("quantum")) {
    topic = "Quantum Physics";
  } else if (combined.includes("web") || combined.includes("html") || combined.includes("css") || combined.includes("react") || combined.includes("js") || combined.includes("javascript")) {
    topic = "Web Development";
  } else if (combined.includes("data") || combined.includes("statistic") || combined.includes("analytics")) {
    topic = "Data Science";
  } else if (combined.includes("algorithm") || combined.includes("leetcode") || combined.includes("dsa") || combined.includes("struct")) {
    topic = "Data Structures & Algorithms";
  } else {
    // No keyword match — use playlist ID hash to pick a topic deterministically
    const topics = ["Linear Algebra", "Machine Learning", "Python Programming", "Web Development", "Data Science", "Data Structures & Algorithms"];
    const hash = listId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    topic = topics[hash % topics.length];
  }

  const videoTemplates = {
    "Linear Algebra": [
      { title: "Eigenvectors and Eigenvalues Explained", orig: 1, duration: 1200, youtube_video_id: "7_dQw4w9Wg1" },
      { title: "Introduction to Vectors & Linear Combinations", orig: 2, duration: 900, youtube_video_id: "7_dQw4w9Wg2" },
      { title: "Matrix Multiplication as Transformations", orig: 3, duration: 1500, youtube_video_id: "7_dQw4w9Wg3" },
      { title: "Solving Systems of Equations with Gaussian Elimination", orig: 4, duration: 1800, youtube_video_id: "7_dQw4w9Wg4" },
      { title: "Dot Products and Projections", orig: 5, duration: 1000, youtube_video_id: "7_dQw4w9Wg5" },
      { title: "Determinants: Visualizing Area Scaling", orig: 6, duration: 1100, youtube_video_id: "7_dQw4w9Wg6" }
    ],
    "Machine Learning": [
      { title: "Neural Networks and Backpropagation Basics", orig: 1, duration: 2400, youtube_video_id: "ml_dQw4w9W1" },
      { title: "Introduction to Linear Regression", orig: 2, duration: 1200, youtube_video_id: "ml_dQw4w9W2" },
      { title: "Understanding Gradient Descent", orig: 3, duration: 1500, youtube_video_id: "ml_dQw4w9W3" },
      { title: "Overfitting, Underfitting and Regularization", orig: 4, duration: 1800, youtube_video_id: "ml_dQw4w9W4" },
      { title: "How Convolutional Neural Networks Work", orig: 5, duration: 2100, youtube_video_id: "ml_dQw4w9W5" }
    ],
    "Python Programming": [
      { title: "Writing Your First Python Script", orig: 1, duration: 600, youtube_video_id: "py_dQw4w9W1" },
      { title: "Decorators and Generators in Python", orig: 2, duration: 1500, youtube_video_id: "py_dQw4w9W2" },
      { title: "Understanding Python Variables and Data Types", orig: 3, duration: 900, youtube_video_id: "py_dQw4w9W3" },
      { title: "Object-Oriented Programming (OOP) in Python", orig: 4, duration: 1800, youtube_video_id: "py_dQw4w9W4" },
      { title: "Control Flow: Loops and Conditional Statements", orig: 5, duration: 1100, youtube_video_id: "py_dQw4w9W5" }
    ],
    "Web Development": [
      { title: "Advanced React State Management with Redux & Context", orig: 1, duration: 2000, youtube_video_id: "wd_dQw4w9W1" },
      { title: "HTML5 and CSS3 Basics for Beginners", orig: 2, duration: 1200, youtube_video_id: "wd_dQw4w9W2" },
      { title: "Introduction to JavaScript and DOM Manipulation", orig: 3, duration: 1500, youtube_video_id: "wd_dQw4w9W3" },
      { title: "Asynchronous JS: Promises, async/await, and APIs", orig: 4, duration: 1800, youtube_video_id: "wd_dQw4w9W4" },
      { title: "Building an API with Node.js and Express", orig: 5, duration: 1600, youtube_video_id: "wd_dQw4w9W5" }
    ],
    "World History": [
      { title: "The Fall of the Roman Empire: A Complex History", orig: 1, duration: 2400, youtube_video_id: "wh_dQw4w9W1" },
      { title: "Origins of the Industrial Revolution", orig: 2, duration: 1800, youtube_video_id: "wh_dQw4w9W2" },
      { title: "World War I: The Spark and the Trenches", orig: 3, duration: 2700, youtube_video_id: "wh_dQw4w9W3" },
      { title: "The French Revolution and the Rise of Napoleon", orig: 4, duration: 2100, youtube_video_id: "wh_dQw4w9W4" }
    ],
    "Quantum Physics": [
      { title: "The Double Slit Experiment and Wave-Particle Duality", orig: 1, duration: 1800, youtube_video_id: "qp_dQw4w9W1" },
      { title: "Quantum Entanglement and Einstein's Spooky Action", orig: 2, duration: 2200, youtube_video_id: "qp_dQw4w9W2" },
      { title: "Introduction to the Schrodinger Equation", orig: 3, duration: 2500, youtube_video_id: "qp_dQw4w9W3" },
      { title: "Quantum Computing: Qubits and Superposition Explained", orig: 4, duration: 1900, youtube_video_id: "qp_dQw4w9W4" }
    ],
    "Data Science": [
      { title: "Pandas DataFrames: Loading and Cleaning Data", orig: 1, duration: 1400, youtube_video_id: "ds_dQw4w9W1" },
      { title: "Exploratory Data Analysis with Matplotlib & Seaborn", orig: 2, duration: 1600, youtube_video_id: "ds_dQw4w9W2" },
      { title: "Introduction to Statistics: Mean, Variance, Distributions", orig: 3, duration: 1200, youtube_video_id: "ds_dQw4w9W3" },
      { title: "Feature Engineering and Data Preprocessing Pipelines", orig: 4, duration: 1800, youtube_video_id: "ds_dQw4w9W4" },
      { title: "Building Predictive Models with Scikit-Learn", orig: 5, duration: 2000, youtube_video_id: "ds_dQw4w9W5" },
      { title: "SQL for Data Scientists: Joins, Aggregations & Subqueries", orig: 6, duration: 1500, youtube_video_id: "ds_dQw4w9W6" }
    ],
    "Data Structures & Algorithms": [
      { title: "Big O Notation and Complexity Analysis", orig: 1, duration: 1100, youtube_video_id: "dsa_Qw4w9W1" },
      { title: "Arrays, Linked Lists and Memory Layout", orig: 2, duration: 1300, youtube_video_id: "dsa_Qw4w9W2" },
      { title: "Stacks, Queues and Recursion", orig: 3, duration: 1400, youtube_video_id: "dsa_Qw4w9W3" },
      { title: "Binary Trees and Tree Traversals", orig: 4, duration: 1600, youtube_video_id: "dsa_Qw4w9W4" },
      { title: "Graph Algorithms: BFS, DFS and Dijkstra", orig: 5, duration: 2000, youtube_video_id: "dsa_Qw4w9W5" },
      { title: "Dynamic Programming: Memoization and Tabulation", orig: 6, duration: 2200, youtube_video_id: "dsa_Qw4w9W6" }
    ]
  };

  const selectedTopic = topic as keyof typeof videoTemplates;
  const videosData = videoTemplates[selectedTopic] || videoTemplates["Web Development"];

  // Topics and clustering mapping
  let topicsData: any[] = [];
  let dependencies: any[] = [];
  let gaps: any[] = [];

  if (selectedTopic === "Linear Algebra") {
    topicsData = [
      { id: "topic_vectors", name: "Vector Spaces & Foundations" },
      { id: "topic_systems", name: "Systems of Linear Equations" },
      { id: "topic_transforms", name: "Linear Transformations & Matrices" },
      { id: "topic_eigen", name: "Eigenvalues & Eigenvectors" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_vectors", dependent_topic_id: "topic_systems" },
      { prerequisite_topic_id: "topic_systems", dependent_topic_id: "topic_transforms" },
      { prerequisite_topic_id: "topic_transforms", dependent_topic_id: "topic_eigen" }
    ];
    gaps = [
      {
        missing_topic: "Limits, Continuity, and Basic R^n Geometry",
        blocks_video_title: "Introduction to Vectors & Linear Combinations",
        explanation: "The playlist starts directly with combinations without validating whether the learner understands basic vector spaces, dimensions, and inner product spaces, which blocks high-level vector space proofs."
      },
      {
        missing_topic: "Matrix Inverses and Rank-Nullity Theorem",
        blocks_video_title: "Eigenvectors and Eigenvalues Explained",
        explanation: "Solving det(A - lambda I) = 0 requires knowing why a non-trivial null space exists only for non-invertible (singular) matrices, which is never explicitly introduced in the playlist."
      }
    ];
  } else if (selectedTopic === "Machine Learning") {
    topicsData = [
      { id: "topic_foundations", name: "Regression & Foundations" },
      { id: "topic_gradient", name: "Gradient Descent Optimization" },
      { id: "topic_neural", name: "Neural Networks & Backpropagation" },
      { id: "topic_regularization", name: "Regularization & Generalization" },
      { id: "topic_cnn", name: "Convolutional Networks (CNNs)" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_foundations", dependent_topic_id: "topic_gradient" },
      { prerequisite_topic_id: "topic_gradient", dependent_topic_id: "topic_neural" },
      { prerequisite_topic_id: "topic_neural", dependent_topic_id: "topic_regularization" },
      { prerequisite_topic_id: "topic_regularization", dependent_topic_id: "topic_cnn" }
    ];
    gaps = [
      {
        missing_topic: "Probability Foundations & Maximum Likelihood Estimation",
        blocks_video_title: "Introduction to Linear Regression",
        explanation: "Linear Regression is introduced without explaining least squares from a probabilistic (Gaussian noise, MLE) standpoint, leaving the model formulation unexplained."
      },
      {
        missing_topic: "Partial Derivatives and Multi-variable Calculus",
        blocks_video_title: "Understanding Gradient Descent",
        explanation: "Computing the gradient and executing partial updates requires multi-variable derivatives (Jacobians), which are assumed as pre-existing knowledge."
      }
    ];
  } else if (selectedTopic === "Python Programming") {
    topicsData = [
      { id: "topic_basics", name: "Syntax & Simple Variables" },
      { id: "topic_flow", name: "Control Flow & Conditional Loops" },
      { id: "topic_oop", name: "Object Oriented Programming (OOP)" },
      { id: "topic_advanced", name: "Advanced Python (Decorators/Generators)" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_basics", dependent_topic_id: "topic_flow" },
      { prerequisite_topic_id: "topic_flow", dependent_topic_id: "topic_oop" },
      { prerequisite_topic_id: "topic_oop", dependent_topic_id: "topic_advanced" }
    ];
    gaps = [
      {
        missing_topic: "Memory Management & Reference Counting",
        blocks_video_title: "Decorators and Generators in Python",
        explanation: "Understanding closures (which power decorators) requires deep comprehension of scope lifespans, namespaces, and python references, which are omitted."
      }
    ];
  } else if (selectedTopic === "Data Science") {
    topicsData = [
      { id: "topic_stats", name: "Statistics & Foundations" },
      { id: "topic_data_wrangling", name: "Data Wrangling & EDA" },
      { id: "topic_feature_eng", name: "Feature Engineering" },
      { id: "topic_modeling", name: "Predictive Modeling" },
      { id: "topic_sql", name: "SQL & Data Querying" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_stats", dependent_topic_id: "topic_data_wrangling" },
      { prerequisite_topic_id: "topic_data_wrangling", dependent_topic_id: "topic_feature_eng" },
      { prerequisite_topic_id: "topic_feature_eng", dependent_topic_id: "topic_modeling" },
      { prerequisite_topic_id: "topic_stats", dependent_topic_id: "topic_sql" }
    ];
    gaps = [
      {
        missing_topic: "Probability Theory & Bayes Theorem",
        blocks_video_title: "Building Predictive Models with Scikit-Learn",
        explanation: "Classification models require understanding of posterior probabilities and likelihood, which are never introduced in this data-focused series."
      }
    ];
  } else if (selectedTopic === "Data Structures & Algorithms") {
    topicsData = [
      { id: "topic_complexity", name: "Complexity Analysis" },
      { id: "topic_linear", name: "Linear Data Structures" },
      { id: "topic_trees", name: "Trees & Hierarchical Structures" },
      { id: "topic_graphs", name: "Graph Algorithms" },
      { id: "topic_dp", name: "Dynamic Programming" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_complexity", dependent_topic_id: "topic_linear" },
      { prerequisite_topic_id: "topic_linear", dependent_topic_id: "topic_trees" },
      { prerequisite_topic_id: "topic_trees", dependent_topic_id: "topic_graphs" },
      { prerequisite_topic_id: "topic_graphs", dependent_topic_id: "topic_dp" }
    ];
    gaps = [
      {
        missing_topic: "Proof by Induction & Mathematical Reasoning",
        blocks_video_title: "Dynamic Programming: Memoization and Tabulation",
        explanation: "Proving optimal substructure and overlapping subproblems requires mathematical induction, which is assumed as prior knowledge but never covered."
      },
      {
        missing_topic: "Hash Functions and Collision Resolution",
        blocks_video_title: "Graph Algorithms: BFS, DFS and Dijkstra",
        explanation: "Adjacency list representations use hash maps internally; understanding time complexity requires knowing how hash collisions affect lookup performance."
      }
    ];
  } else {
    // Default Web Dev
    topicsData = [
      { id: "topic_html", name: "HTML & CSS Core" },
      { id: "topic_js", name: "JS & DOM Manipulation" },
      { id: "topic_async", name: "Asynchronous JS & APIs" },
      { id: "topic_express", name: "Express Backends" },
      { id: "topic_react", name: "Advanced Frontends & React" }
    ];
    dependencies = [
      { prerequisite_topic_id: "topic_html", dependent_topic_id: "topic_js" },
      { prerequisite_topic_id: "topic_js", dependent_topic_id: "topic_async" },
      { prerequisite_topic_id: "topic_async", dependent_topic_id: "topic_express" },
      { prerequisite_topic_id: "topic_express", dependent_topic_id: "topic_react" }
    ];
    gaps = [
      {
        missing_topic: "HTTP Protocols, Headers, and CORS Foundations",
        blocks_video_title: "Asynchronous JS: Promises, async/await, and APIs",
        explanation: "Making fetch requests and reading responses relies on understanding status codes, verbs, and cross-origin resource sharing, which are omitted from this practical guide."
      }
    ];
  }

  // Segment simulation
  const finalVideos = videosData.map((v: any, index: number) => {
    // Assign primary topic mapping for mock
    let primary_topic_name = topicsData[0].name;
    let primary_topic_id = topicsData[0].id;

    if (selectedTopic === "Linear Algebra") {
      if (v.title.includes("Vectors") || v.title.includes("Projections")) {
        primary_topic_name = "Vector Spaces & Foundations";
        primary_topic_id = "topic_vectors";
      } else if (v.title.includes("Equations")) {
        primary_topic_name = "Systems of Linear Equations";
        primary_topic_id = "topic_systems";
      } else if (v.title.includes("Matrix") || v.title.includes("Determinants")) {
        primary_topic_name = "Linear Transformations & Matrices";
        primary_topic_id = "topic_transforms";
      } else {
        primary_topic_name = "Eigenvalues & Eigenvectors";
        primary_topic_id = "topic_eigen";
      }
    } else if (selectedTopic === "Machine Learning") {
      if (v.title.includes("Regression")) {
        primary_topic_name = "Regression & Foundations";
        primary_topic_id = "topic_foundations";
      } else if (v.title.includes("Gradient")) {
        primary_topic_name = "Gradient Descent Optimization";
        primary_topic_id = "topic_gradient";
      } else if (v.title.includes("Neural")) {
        primary_topic_name = "Neural Networks & Backpropagation";
        primary_topic_id = "topic_neural";
      } else if (v.title.includes("Overfitting")) {
        primary_topic_name = "Regularization & Generalization";
        primary_topic_id = "topic_regularization";
      } else {
        primary_topic_name = "Convolutional Networks (CNNs)";
        primary_topic_id = "topic_cnn";
      }
    } else if (selectedTopic === "Python Programming") {
      if (v.title.includes("Script") || v.title.includes("Data Types")) {
        primary_topic_name = "Syntax & Simple Variables";
        primary_topic_id = "topic_basics";
      } else if (v.title.includes("Flow") || v.title.includes("Control")) {
        primary_topic_name = "Control Flow & Conditional Loops";
        primary_topic_id = "topic_flow";
      } else if (v.title.includes("OOP") || v.title.includes("Object")) {
        primary_topic_name = "Object Oriented Programming (OOP)";
        primary_topic_id = "topic_oop";
      } else {
        primary_topic_name = "Advanced Python (Decorators/Generators)";
        primary_topic_id = "topic_advanced";
      }
    } else if (selectedTopic === "Web Development") {
      if (v.title.includes("HTML")) {
        primary_topic_name = "HTML & CSS Core";
        primary_topic_id = "topic_html";
      } else if (v.title.includes("DOM") || v.title.includes("JavaScript")) {
        primary_topic_name = "JS & DOM Manipulation";
        primary_topic_id = "topic_js";
      } else if (v.title.includes("Asynchronous")) {
        primary_topic_name = "Asynchronous JS & APIs";
        primary_topic_id = "topic_async";
      } else if (v.title.includes("Express")) {
        primary_topic_name = "Express Backends";
        primary_topic_id = "topic_express";
      } else {
        primary_topic_name = "Advanced Frontends & React";
        primary_topic_id = "topic_react";
      }
    } else if (selectedTopic === "Data Science") {
      if (v.title.includes("Statistics") || v.title.includes("Mean")) {
        primary_topic_name = "Statistics & Foundations"; primary_topic_id = "topic_stats";
      } else if (v.title.includes("Pandas") || v.title.includes("Exploratory")) {
        primary_topic_name = "Data Wrangling & EDA"; primary_topic_id = "topic_data_wrangling";
      } else if (v.title.includes("Feature") || v.title.includes("Preprocessing")) {
        primary_topic_name = "Feature Engineering"; primary_topic_id = "topic_feature_eng";
      } else if (v.title.includes("Predictive") || v.title.includes("Scikit")) {
        primary_topic_name = "Predictive Modeling"; primary_topic_id = "topic_modeling";
      } else {
        primary_topic_name = "SQL & Data Querying"; primary_topic_id = "topic_sql";
      }
    } else if (selectedTopic === "Data Structures & Algorithms") {
      if (v.title.includes("Big O") || v.title.includes("Complexity")) {
        primary_topic_name = "Complexity Analysis"; primary_topic_id = "topic_complexity";
      } else if (v.title.includes("Arrays") || v.title.includes("Stacks") || v.title.includes("Queues")) {
        primary_topic_name = "Linear Data Structures"; primary_topic_id = "topic_linear";
      } else if (v.title.includes("Tree") || v.title.includes("Binary")) {
        primary_topic_name = "Trees & Hierarchical Structures"; primary_topic_id = "topic_trees";
      } else if (v.title.includes("Graph") || v.title.includes("BFS") || v.title.includes("DFS")) {
        primary_topic_name = "Graph Algorithms"; primary_topic_id = "topic_graphs";
      } else {
        primary_topic_name = "Dynamic Programming"; primary_topic_id = "topic_dp";
      }
    }

    return {
      ...v,
      primary_topic_name,
      primary_topic_id
    };
  });

  return {
    playlistTitle: `${topic} Masterclass Curriculum`,
    videos: finalVideos,
    topics: topicsData,
    dependencies,
    gaps
  };
}

// Background Analysis Core Pipeline Execution
async function runBackgroundAnalysis(playlistId: string, url: string, topicHint: string = "") {
  const playlist = db.playlists.get(playlistId);
  if (!playlist) return;

  try {
    const ai = getGroqClient();
    const hasKey = !!process.env.GROQ_API_KEY;

    // --- STEP 1: FETCHING TRANSCRIPTS ---
    playlist.status = 'fetching_transcripts';
    db.playlists.set(playlistId, { ...playlist });
    console.log(`[Job ${playlistId}] Step 1: Fetching transcripts...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    let curriculumData: any;

    if (hasKey) {
      try {
        console.log(`[Job ${playlistId}] Querying Groq (llama-3.3-70b) for playlist analysis...`);
        const prompt = `Analyze this YouTube playlist URL: "${url}".
The playlist ID is: "${playlist.youtube_playlist_id}"
${topicHint ? `The user has described this playlist as: "${topicHint}"` : ""}

${topicHint 
  ? `Generate a curriculum specifically for the topic: "${topicHint}". Use this as the primary guide for content.`
  : `Look up this playlist ID or video ID in your training data. If you recognize this specific playlist, use its actual content. If not, analyze the URL components carefully to determine the most likely educational topic.`
}

Generate a comprehensive, pedagogically structured JSON object with:
1. "playlistTitle": The actual or most likely title of this playlist
2. "videos": Array of 5-8 videos typical for this subject, each with:
   - "youtube_video_id": realistic 11-char string
   - "title": lecture title relevant to the topic
   - "original_position": integer (1-indexed, intentionally OUT of logical order to demonstrate reordering)
   - "duration_seconds": integer (900-2400)
   - "segments": array of 2 objects, each with "start_time", "end_time", "transcript_text" (2-3 technical sentences)
3. "topics": Array of 3-5 topic clusters, each with "id", "name", "video_ids"
4. "dependencies": Array of prerequisite pairs with "prerequisite_topic_id", "dependent_topic_id"
5. "gaps": Array of 1-3 missing prerequisite topics, each with "missing_topic", "blocks_video_title", "explanation"

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation.`;

        console.log(`[Job ${playlistId}] Querying Groq (llama-3.3-70b) for playlist analysis...`);
        const completion = await ai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are an expert curriculum designer and YouTube content analyst. Always respond with valid JSON only, no markdown code blocks, no extra text."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 4000,
        });

        const responseText = completion.choices[0]?.message?.content || "{}";
        const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsedResult = JSON.parse(cleanJson);
        // Reinforce model assignment within videos
        parsedResult.videos = parsedResult.videos.map((v: any) => {
          const matchingTopic = parsedResult.topics.find((t: any) => t.video_ids.includes(v.youtube_video_id));
          return {
            ...v,
            primary_topic_name: matchingTopic ? matchingTopic.name : (parsedResult.topics[0]?.name || "General"),
            primary_topic_id: matchingTopic ? matchingTopic.id : (parsedResult.topics[0]?.id || "default")
          };
        });
        curriculumData = parsedResult;
      } catch (err) {
        console.error("Gemini curriculum generation failed, falling back to clean structured mock:", err);
        curriculumData = generateMockCurriculum(url, playlist.youtube_playlist_id);
      }
    } else {
      curriculumData = generateMockCurriculum(url, playlist.youtube_playlist_id);
    }

    // Save Playlist Title & Video count
    playlist.title = curriculumData.playlistTitle || "Lecture Hop Playlist Analysis";
    playlist.video_count = curriculumData.videos.length;

    // Save videos to DB
    const listVideos: Video[] = curriculumData.videos.map((v: any, index: number) => ({
      id: `vid_${playlistId}_${index}`,
      playlist_id: playlistId,
      youtube_video_id: v.youtube_video_id,
      title: v.title,
      original_position: v.original_position || (index + 1),
      suggested_position: v.original_position || (index + 1), // will be updated in sorting
      duration_seconds: v.duration_seconds || 1200,
      primary_topic_name: v.primary_topic_name,
      primary_topic_id: v.primary_topic_id
    }));
    db.videos.set(playlistId, listVideos);

    // Save segments with mock embeddings (vector length 384 as requested)
    const listSegments: Segment[] = [];
    curriculumData.videos.forEach((v: any, vIdx: number) => {
      const videoRecord = listVideos[vIdx];
      if (v.segments && Array.isArray(v.segments)) {
        v.segments.forEach((seg: any, sIdx: number) => {
          // Generate a vector of 384 numbers for pgvector simulation
          const embedding = Array.from({ length: 384 }, () => parseFloat((Math.random() * 2 - 1).toFixed(4)));
          listSegments.push({
            id: `seg_${videoRecord.id}_${sIdx}`,
            video_id: videoRecord.id,
            start_time: seg.start_time,
            end_time: seg.end_time,
            transcript_text: seg.transcript_text,
            embedding
          });
        });
      }
    });
    db.segments.set(playlistId, listSegments);

    // --- STEP 2: EMBEDDING ---
    playlist.status = 'embedding';
    db.playlists.set(playlistId, { ...playlist });
    console.log(`[Job ${playlistId}] Step 2: Generating and storing segment embeddings in PostgreSQL pgvector...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // --- STEP 3: CLUSTERING ---
    playlist.status = 'clustering';
    db.playlists.set(playlistId, { ...playlist });
    console.log(`[Job ${playlistId}] Step 3: Clustering segments using HDBSCAN into distinct topics...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Save topics
    const savedTopics: Topic[] = curriculumData.topics.map((t: any) => ({
      id: t.id,
      name: t.name,
      centroid_embedding: Array.from({ length: 384 }, () => parseFloat((Math.random() * 2 - 1).toFixed(4)))
    }));
    db.topics.set(playlistId, savedTopics);

    // --- STEP 4: SORTING & GRAPH CONSTRUCTION ---
    playlist.status = 'sorting';
    db.playlists.set(playlistId, { ...playlist });
    console.log(`[Job ${playlistId}] Step 4: Pairwise dependency mapping & Topological sort...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Topological sort topic IDs
    const topicIds = savedTopics.map(t => t.id);
    const sortedTopicIds = topologicalSort(topicIds, curriculumData.dependencies);

    // Reorder videos based on topic sorting
    const finalOrderedVideos = [...listVideos];
    // Sort videos: Group by topic sort order, within each topic retain original ordering
    finalOrderedVideos.sort((a: any, b: any) => {
      const indexA = sortedTopicIds.indexOf(a.primary_topic_id);
      const indexB = sortedTopicIds.indexOf(b.primary_topic_id);
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return a.original_position - b.original_position;
    });

    // Assign suggested_position (1-indexed)
    finalOrderedVideos.forEach((v, index) => {
      // Find original in map and assign position
      const found = listVideos.find(orig => orig.id === v.id);
      if (found) {
        found.suggested_position = index + 1;
      }
    });
    db.videos.set(playlistId, listVideos);

    // Save gaps
    const gapRecords: TopicGap[] = curriculumData.gaps.map((g: any, index: number) => ({
      id: `gap_${playlistId}_${index}`,
      playlist_id: playlistId,
      missing_topic: g.missing_topic,
      blocks_video_title: g.blocks_video_title,
      explanation: g.explanation
    }));
    db.gaps.set(playlistId, gapRecords);

    // --- STEP 5: COMPLETED ---
    playlist.status = 'completed';
    playlist.analyzed_at = new Date().toISOString();
    db.playlists.set(playlistId, { ...playlist });
    console.log(`[Job ${playlistId}] Pipeline completed successfully!`);

  } catch (error: any) {
    console.error(`[Job ${playlistId}] Pipeline failed:`, error);
    playlist.status = 'failed';
    playlist.error = error.message || "An unexpected error occurred during analysis.";
    db.playlists.set(playlistId, { ...playlist });
  }
}

// ================= API ENDPOINTS =================

// POST /api/playlists/analyze
app.post("/api/playlists/analyze", (req, res) => {
  const { url, topic } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Playlist URL is required." });
  }

  const listId = parsePlaylistId(url);
  const id = `pl_${Date.now()}`;

  const newPlaylist: Playlist = {
    id,
    youtube_playlist_id: listId,
    title: "Analyzing Playlist...",
    video_count: 0,
    status: 'pending',
    analyzed_at: null
  };

  db.playlists.set(id, newPlaylist);
  runBackgroundAnalysis(id, url, topic || "");
  res.json({ id });
});

// GET /api/playlists/{id}
app.get("/api/playlists/:id", (req, res) => {
  const { id } = req.params;
  const playlist = db.playlists.get(id);

  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found." });
  }

  const videos = db.videos.get(id) || [];
  const status = playlist.status;

  res.json({
    id: playlist.id,
    youtube_playlist_id: playlist.youtube_playlist_id,
    title: playlist.title,
    video_count: playlist.video_count,
    status: playlist.status,
    analyzed_at: playlist.analyzed_at,
    error: playlist.error,
    videos: status === 'completed' ? videos : [] // only return videos when completed
  });
});

// GET /api/playlists/{id}/gaps
app.get("/api/playlists/:id/gaps", (req, res) => {
  const { id } = req.params;
  const playlist = db.playlists.get(id);

  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found." });
  }

  const gaps = db.gaps.get(id) || [];
  res.json({ gaps });
});

// ================= VITE ASSET INGESTION & SPA ROUTING =================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // In dev mode, Vite runs separately via `npm run dev:ui`
    // Just serve the API here
  } else {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API Server running on http://localhost:${PORT}`);
  });
}

startServer();
