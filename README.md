# REST API for Penpot Copilot  

## 🛠️ Getting Started  

Follow these steps to set up and run the Penpot Copilot REST API on your local machine:  

1. **Install Prerequisites**  
   - Ensure **Git** and **Node.js** are installed on your system.  

2. **Clone the Repository**  
   - Clone this repository to your local machine using:  
     ```bash  
     git clone https://github.com/CijeTheCreator/penpot-copilot-backend
     ```  

3. **Configure Environment Variables**  
   - In the root folder, create a `.env` file. Add the following variables:  
     - `OPENAI_KEY`: Your OpenAI API key.  
     - `PENPOT_DATABASE_URL`: The PostgreSQL connection string for your Penpot database.  

     Example `.env` file:  
     ```env  
     OPENAI_KEY=your_openai_key  
     PENPOT_DATABASE_URL=your_postgres_url  
     ```  

4. **Set Up the Database**  
   - Use Prisma to initialize the database schema:  
     ```bash  
     npx prisma db push  
     ```  

5. **Install Dependencies and Start the Server**  
   - Install the required packages and run the development server:  
     ```bash  
     npm install && npm run dev  
     ```  

6. **Connect the Frontend**  
   - Copy the API's base address (e.g., `http://localhost:3000`) and set it in your frontend's `.env` file under the `ADDRESS` variable.  
