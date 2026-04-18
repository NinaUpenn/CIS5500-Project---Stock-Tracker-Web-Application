# Stock News Trader

A web application for tracking S&P 500 stocks alongside related financial news. Users can search companies, view historical price charts, browse sector/industry leaderboards, and see trending tickers based on recent news mentions.

**Team:** Kartheek Gavini, Philip Lee, Na Ni

## Project Structure

```
webapp/
├── client/   # React frontend (Create React App + MUI)
└── server/   # Node.js + Express API (connects to PostgreSQL on AWS RDS)
```

## Running Locally

You need **Node.js 18+** installed. Open two terminals.

### 1. Start the server

```bash
cd webapp/server
npm install
npm start
```

The API runs on `http://localhost:8080`.

### 2. Start the client

```bash
cd webapp/client
npm install
npm start
```

The frontend opens at `http://localhost:3000`.
