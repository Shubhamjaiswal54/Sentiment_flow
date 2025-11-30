# SentimentFlow: Autonomous, Prediction-Driven DeFi Trading

SentimentFlow is a cutting-edge DeFi trading system that bridges the gap between real-world events and on-chain execution. It allows users to create automated trading strategies that trigger based on a combination of prediction market probabilities and social media sentiment.

Built on the high-speed Aptos blockchain, SentimentFlow uses a unique "MCP Brain" architecture to eliminate slow, traditional oracles, enabling near-instantaneous, trustless execution of complex trading logic.

## 🌟 Key Features

-   **Prediction-Driven Strategies:** Create rules based on real-time data from Polymarket.
-   **Social Sentiment Analysis:** Leverage NLP to gauge market sentiment from X/Twitter.
-   **Autonomous Execution Engine:** A backend worker continuously evaluates and executes strategies without human intervention.
-   **Aptos MCP Integration:** Direct on-chain execution via Model Context Protocol, removing oracle bottlenecks.
-   **Terminal-Style UI:** A sleek, retro-futuristic interface for monitoring and control.
-   **Full Transparency:** Every decision and execution is logged on-chain and in the database for full auditability.

## 🏗️ Architecture

SentimentFlow is a full-stack application with a clear separation of concerns:

1.  **Backend (Node.js/TypeScript):** The core logic engine. It handles data ingestion, strategy evaluation, and triggers on-chain execution via Aptos MCP.
2.  **Frontend (React/TypeScript):** A terminal-styled user interface for monitoring markets, managing strategies, and viewing execution history.
3.  **Database (PostgreSQL):** Stores user strategies, historical market/sentiment snapshots, and execution logs.
4.  **On-Chain (Aptos Move):** A smart contract module that securely stores strategy parameters and executes trades when triggered by the backend.

## 📁 Project Structure

The project is split into two main parts:

```
sentimentflow/
├─ backend/                 # Node.js/TypeScript backend and API
│  ├─ src/
│  │  ├─ api/               # REST API routes
│  │  ├─ db/                # Prisma ORM client
│  │  ├─ ingestion/         # Data fetchers for Polymarket & X
│  │  ├─ strategy/          # Core strategy execution engine
│  │  ├─ mcp/               # Aptos MCP tool wrappers
│  │  └─ ...
│  ├─ prisma/
│  │  └─ schema.prisma      # Database schema
│  └─ package.json
│
└─ frontend/                # React/TypeScript frontend
   ├─ src/
   │  ├─ components/        # Reusable UI components
   │  ├─ hooks/             # Custom React hooks
   │  ├─ pages/             # Main application pages
   │  └─ ...
   └─ package.json
```

## 🚀 Quick Start

Follow these instructions to get the entire SentimentFlow application running locally.

### Prerequisites

-   **Node.js** (v16 or higher)
-   **PostgreSQL**
-   **Aptos CLI** (for deploying the Move module)
-   An **Aptos Wallet** (e.g., [Petra](https://petra.app/)) for the frontend.

### 1. Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the `backend` root. See the [Environment Variables](#environment-variables) section for details.

4.  **Set up the database:**
    ```bash
    npm run db:migrate
    npm run db:generate
    ```

5.  **Deploy the Move Module:**
    *   Follow the instructions in the `backend/README.md` to deploy the `sentiment_flow.move` module to the Aptos network of your choice (Devnet recommended).
    *   Update the `APTOS_MODULE_ADDRESS` in your `.env` file with the address of your deployed module.

6.  **Start the backend server:**
    ```bash
    npm run dev
    ```
    The API will be running on `http://localhost:3001`.

7.  **Start the background worker:**
    In a **new terminal**, navigate to the `backend` directory and run:
    ```bash
    npm run worker
    ```

### 2. Frontend Setup

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the frontend application:**
    ```bash
    npm start
    ```
    The application will open in your browser at `http://localhost:3000`.

### 4. Connect Your Wallet

1.  Open the SentimentFlow app in your browser.
2.  You will be prompted to connect your Aptos wallet (e.g., Petra).
3.  Ensure your wallet is connected to the same network (Devnet/Testnet) where you deployed the Move module.

You are now ready to create and monitor your first automated trading strategy!

## ⚙️ Environment Variables

You must configure a `.env` file in the `backend` directory.

```dotenv
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/sentimentflow"

# Aptos Blockchain Configuration
APTOS_NODE_URL="https://fullnode.devnet.aptoslabs.com"
APTOS_MODULE_ADDRESS="0xYourDeployedModuleAddress"

# Twitter API Configuration
TWITTER_BEARER_TOKEN="YOUR_TWITTER_BEARER_TOKEN"

# Data Source Configuration
POLYMARKET_API_URL="https://strapi-matic.poly.market/markets"

# Server Configuration
PORT=3001
```

## 📚 API Documentation

The backend exposes a RESTful API for the frontend and other clients.

| Method | Endpoint                  | Description                                   |
| :----- | :------------------------ | :-------------------------------------------- |
| `POST`   | `/strategy`               | Create and register a new trading strategy.    |
| `GET`    | `/strategy/:id`           | Fetch details for a specific strategy.         |
| `GET`    | `/markets`                | Get the latest market snapshot data.           |
| `GET`    | `/sentiment/:tag`         | Get the sentiment timeline for a specific tag. |
| `POST`   | `/execute`               | Manually trigger the execution of a strategy.  |
| `POST`   | `/simulate`               | Run a historical backtest on a strategy.       |
| `GET`    | `/health`                 | Check the health status of the backend.        |

## 🧠 How It Works: The Dataflow

1.  **Ingestion:** Backend workers continuously pull data from Polymarket and X/Twitter, storing it in the database.
2.  **Creation:** A user defines a strategy via the frontend, which is saved to the database and registered on-chain.
3.  **Evaluation:** A cron job runs every 30-60 seconds, fetching all active strategies and checking them against the latest market and sentiment data.
4.  **Execution:** If a strategy's conditions are met, the backend uses **Aptos MCP** to call the `execute_strategy` function on the Move module, which performs the trade.
5.  **Monitoring:** The frontend polls the backend to display real-time data, strategy status, and execution logs.

## 🛠️ Tech Stack

-   **Backend:** Node.js, TypeScript, Fastify, Prisma, node-cron
-   **Frontend:** React, TypeScript, React Router, Recharts, Tailwind CSS
-   **Database:** PostgreSQL
-   **Blockchain:** Aptos, Move, Aptos MCP
-   **APIs:** Twitter API v2, Polymarket API

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
