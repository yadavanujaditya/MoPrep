const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// This defines what a "Year" entry looks like in the DB
const YearSchema = new mongoose.Schema({
  year: { type: String, required: true, unique: true },
  description: String
});

// This defines what a "Question" looks like
const QuestionSchema = new mongoose.Schema({
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: 'Year' },
  year: Number,
  questionText: String,
  options: {
    A: String,
    B: String,
    C: String,
    D: String
  },
  correctAnswer: String,
  tags: [String], // All labels like "Pharmacology", "Renal", "BPH" go here
  explanation: String
});

const Year = mongoose.model('Year', YearSchema);
const Question = mongoose.model('Question', QuestionSchema);

// Seed database with sample data
async function seedDatabase() {
  try {
    await mongoose.connect('mongodb://localhost:27017/quizbank');
    console.log('Connected to MongoDB');

    // Check if data already exists
    const existingYears = await Year.countDocuments();
    if (existingYears > 0) {
      console.log('Database already seeded with', existingYears, 'years');
      mongoose.connection.close();
      return;
    }

    // Try to read data.json if it exists
    let questionsData = [];
    const dataFilePath = path.join(__dirname, 'data.json');
    
    if (fs.existsSync(dataFilePath)) {
      const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
      questionsData = JSON.parse(fileContent);
      console.log(`✓ Loaded ${questionsData.length} questions from data.json`);
    } else {
      console.log('data.json not found, using sample questions');
      questionsData = [];
    }

    // Extract unique years from questionsData or use defaults
    let uniqueYears;
    if (questionsData.length > 0) {
      uniqueYears = [...new Set(questionsData.map(q => q.year))].sort();
      console.log('Years found in data:', uniqueYears);
    } else {
      uniqueYears = [2021, 2022, 2023, 2024];
    }

    // Create years
    const years = await Year.insertMany(
      uniqueYears.map(y => ({
        year: y.toString(),
        description: `Quiz Bank ${y}`
      }))
    );

    // Create sample questions for each year
    for (const yearDoc of years) {
      const yearNumber = parseInt(yearDoc.year);
      const questionsForYear = questionsData
        .filter(q => q.year === yearNumber) // Filter questions by year
        .map(q => ({
          yearId: yearDoc._id,
          year: yearNumber,
          questionText: q.question_text || q.questionText,
          options: q.options || { A: '', B: '', C: '', D: '' },
          correctAnswer: q.correct_answer || q.correctAnswer,
          tags: [
            q.category || 'General',
            q.system || 'Knowledge',
            ...(q.tags || [])
          ].filter(Boolean),
          explanation: q.explanation || ''
        }));
      
      if (questionsForYear.length > 0) {
        await Question.insertMany(questionsForYear);
      }
    }

    console.log('✓ Database seeded successfully');
    console.log(`✓ Created ${years.length} years with ${questionsData.length} questions each`);
    mongoose.connection.close();
  } catch (err) {
    console.error('Error seeding database:', err);
    mongoose.connection.close();
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { Year, Question };