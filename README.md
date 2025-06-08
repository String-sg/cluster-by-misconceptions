# Cluster by Misconceptions

A Node.js web application to help cluster student responses by misconceptions for better feedback and instructional planning.

## 🛠 Features

- Student and teacher views built with EJS templates
- Backend powered by Express and MongoDB
- Designed for analyzing and visualizing student understanding

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/cluster-by-misconceptions.git
cd cluster-by-misconceptions
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Create a `.env` file in the root directory and add the following:

```env
MONGODB_URI=mongodb://localhost:27017/misconceptions-db
PORT=3000
```

(Replace `MONGODB_URI` with your MongoDB Atlas URI if deploying.)

### 4. Run the Application

```bash
npm start
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

## 🧪 Deployment

To deploy on platforms like Heroku, Render, or Railway:

1. Push this repo to your GitHub.
2. Connect the repo in your deployment platform.
3. Add your environment variables (e.g., `MONGODB_URI`) in the platform settings.
4. Set the build command to `npm install` and the start command to `npm start`.

## 💡 Potential Extensions

- ✨ **LLM Integration**: Use OpenAI or Claude to generate misconception clusters automatically.
- 📊 **Analytics Dashboard**: Visualize misconception trends over time per topic/class.
- 🧑‍🏫 **Feedback Generator**: Automatically suggest feedback based on clusters.
- 🧩 **Tagging System**: Allow manual/automatic tagging of responses by concepts.
- 🔒 **Authentication**: Add student/teacher login with role-based access.
- 🌍 **Localization**: Support multilingual student inputs and feedback.

## 📁 Folder Structure

```
cluster-by-misconceptions/
├── views/               # EJS templates for UI
├── server.js            # Express server logic
├── db.js                # MongoDB connection logic
├── package.json         # Project metadata and dependencies
```

## 📄 License

MIT License — feel free to fork and contribute!
