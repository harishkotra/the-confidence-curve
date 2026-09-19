/**
 * The question bank.
 *
 * 50 items, 5 per difficulty level from 1 to 10. Every item has a single
 * short, unambiguous stored answer so that grading is deterministic and
 * auditable: the model's `ANSWER:` line is normalised and compared against
 * `answer` (or any string in `aliases`) in code. No model ever grades
 * another model.
 *
 * `note` records why the stored answer is correct, so a reader can audit the
 * bank without re-deriving each item.
 */

export type Category = 'maths' | 'recall' | 'logic' | 'comprehension';

export interface Question {
  id: string;
  /** 1 (trivial) .. 10 (hard) */
  difficulty: number;
  category: Category;
  question: string;
  /** The stored correct answer. Graded by normalised match. */
  answer: string;
  /** Additional accepted surface forms of the same answer. */
  aliases?: string[];
  /** Why the stored answer is correct. */
  note: string;
}

export const QUESTION_BANK: Question[] = [
  // ---------------------------------------------------------------- level 1
  {
    id: 'q01',
    difficulty: 1,
    category: 'maths',
    question: 'What is 7 + 8?',
    answer: '15',
    note: '7 + 8 = 15.',
  },
  {
    id: 'q02',
    difficulty: 1,
    category: 'recall',
    question: 'What is the capital city of France?',
    answer: 'Paris',
    note: 'Paris is the capital of France.',
  },
  {
    id: 'q03',
    difficulty: 1,
    category: 'recall',
    question: 'How many days are there in a week?',
    answer: '7',
    note: 'A week has seven days.',
  },
  {
    id: 'q04',
    difficulty: 1,
    category: 'maths',
    question: 'What is 12 divided by 4?',
    answer: '3',
    note: '12 / 4 = 3.',
  },
  {
    id: 'q05',
    difficulty: 1,
    category: 'recall',
    question: 'Which is the largest planet in our solar system?',
    answer: 'Jupiter',
    note: 'Jupiter is the largest planet by mass and diameter.',
  },

  // ---------------------------------------------------------------- level 2
  {
    id: 'q06',
    difficulty: 2,
    category: 'maths',
    question: 'What is 17 multiplied by 3?',
    answer: '51',
    note: '17 x 3 = 51.',
  },
  {
    id: 'q07',
    difficulty: 2,
    category: 'recall',
    question: 'What is the chemical symbol for gold?',
    answer: 'Au',
    note: 'Gold is Au, from the Latin aurum.',
  },
  {
    id: 'q08',
    difficulty: 2,
    category: 'recall',
    question: 'How many sides does a hexagon have?',
    answer: '6',
    note: 'A hexagon has six sides.',
  },
  {
    id: 'q09',
    difficulty: 2,
    category: 'recall',
    question: 'Who wrote the play Romeo and Juliet?',
    answer: 'William Shakespeare',
    aliases: ['Shakespeare'],
    note: 'Shakespeare wrote Romeo and Juliet, c. 1595.',
  },
  {
    id: 'q10',
    difficulty: 2,
    category: 'maths',
    question: 'What is 100 minus 37?',
    answer: '63',
    note: '100 - 37 = 63.',
  },

  // ---------------------------------------------------------------- level 3
  {
    id: 'q11',
    difficulty: 3,
    category: 'maths',
    question: 'What is the square root of 144?',
    answer: '12',
    note: '12 x 12 = 144; the principal square root is 12.',
  },
  {
    id: 'q12',
    difficulty: 3,
    category: 'recall',
    question: 'What is the capital city of Australia?',
    answer: 'Canberra',
    note: 'Canberra is the capital; Sydney and Melbourne are larger but are not the capital.',
  },
  {
    id: 'q13',
    difficulty: 3,
    category: 'maths',
    question: 'What is 15% of 200?',
    answer: '30',
    note: '0.15 x 200 = 30.',
  },
  {
    id: 'q14',
    difficulty: 3,
    category: 'maths',
    question: 'What is the smallest prime number?',
    answer: '2',
    note: '2 is the smallest prime; 1 is not prime by definition.',
  },
  {
    id: 'q15',
    difficulty: 3,
    category: 'maths',
    question: 'How many minutes are there in 2.5 hours?',
    answer: '150',
    note: '2.5 x 60 = 150.',
  },

  // ---------------------------------------------------------------- level 4
  {
    id: 'q16',
    difficulty: 4,
    category: 'maths',
    question: 'What is 2 raised to the power of 10?',
    answer: '1024',
    note: '2^10 = 1024.',
  },
  {
    id: 'q17',
    difficulty: 4,
    category: 'recall',
    question: 'In which year did the Berlin Wall fall?',
    answer: '1989',
    note: 'The Wall was opened on 9 November 1989.',
  },
  {
    id: 'q18',
    difficulty: 4,
    category: 'maths',
    question:
      'A train travels 180 kilometres in 2.5 hours. What is its average speed in kilometres per hour?',
    answer: '72',
    note: '180 / 2.5 = 72 km/h.',
  },
  {
    id: 'q19',
    difficulty: 4,
    category: 'recall',
    question: 'How many bones are there in the adult human body?',
    answer: '206',
    note: 'The standard adult count is 206 bones.',
  },
  {
    id: 'q20',
    difficulty: 4,
    category: 'maths',
    question: 'Express three quarters as a percentage. Give just the number.',
    answer: '75',
    note: '3/4 = 0.75 = 75%.',
  },

  // ---------------------------------------------------------------- level 5
  {
    id: 'q21',
    difficulty: 5,
    category: 'maths',
    question: 'What is the sum of all integers from 1 to 20 inclusive?',
    answer: '210',
    note: 'n(n+1)/2 with n = 20 gives 20 x 21 / 2 = 210.',
  },
  {
    id: 'q22',
    difficulty: 5,
    category: 'maths',
    question:
      'A sequence begins 1, 1, 2, 3, 5, 8, ... where each term is the sum of the two preceding terms. What is the 7th term?',
    answer: '13',
    note: 'Terms: 1, 1, 2, 3, 5, 8, 13. The 7th is 13.',
  },
  {
    id: 'q23',
    difficulty: 5,
    category: 'recall',
    question: 'Which chemical element has atomic number 26?',
    answer: 'Iron',
    aliases: ['Fe'],
    note: 'Iron has 26 protons; symbol Fe.',
  },
  {
    id: 'q24',
    difficulty: 5,
    category: 'maths',
    question:
      'A shirt is priced at $40. It is discounted by 25%, and then 10% sales tax is added to the discounted price. What is the final price in dollars?',
    answer: '33',
    note: '40 x 0.75 = 30; 30 x 1.10 = 33. The discount and the tax do not cancel.',
  },
  {
    id: 'q25',
    difficulty: 5,
    category: 'maths',
    question: 'What is the sum of the interior angles of a pentagon, in degrees?',
    answer: '540',
    note: '(5 - 2) x 180 = 540 degrees.',
  },

  // ---------------------------------------------------------------- level 6
  {
    id: 'q26',
    difficulty: 6,
    category: 'maths',
    question:
      'How many times does the digit 7 appear when you write out every integer from 1 to 100 inclusive?',
    answer: '20',
    note: 'Ten appearances in the units place (7, 17, ... 97) and ten in the tens place (70-79), so 20.',
  },
  {
    id: 'q27',
    difficulty: 6,
    category: 'comprehension',
    question: `Read the passage and answer the question.

"The Meridian Bridge was completed in 1932, three years behind schedule. Its engineers had underestimated the river's spring currents, and two winters of unusually heavy ice forced repeated redesigns. When it finally opened, the bridge carried far fewer vehicles than projected for its first decade, because the planned eastern approach road was never built. Not until 1951, when that road was finished, did traffic reach the volumes the original planners had forecast."

According to the passage, which single factor explains the bridge's lower-than-projected traffic in its first decade? Answer with one letter only.
A) the river's spring currents
B) ice damage over two winters
C) the eastern approach road was never built
D) the bridge opened late, in 1932`,
    answer: 'C',
    note: 'The passage attributes the low first-decade traffic directly to the unbuilt eastern approach road.',
  },
  {
    id: 'q28',
    difficulty: 6,
    category: 'logic',
    question:
      'If 5 machines take 5 minutes to make 5 widgets, how many minutes would 100 machines take to make 100 widgets?',
    answer: '5',
    note: 'Each machine makes one widget in 5 minutes, so 100 machines make 100 widgets in 5 minutes.',
  },
  {
    id: 'q29',
    difficulty: 6,
    category: 'maths',
    question:
      'What is the smallest positive integer that is divisible by every integer from 1 to 10?',
    answer: '2520',
    note: 'LCM(1..10) = 2^3 x 3^2 x 5 x 7 = 2520.',
  },
  {
    id: 'q30',
    difficulty: 6,
    category: 'maths',
    question:
      'At exactly 3:15, what is the smaller angle between the hour hand and the minute hand of an analogue clock, in degrees?',
    answer: '7.5',
    note: 'Minute hand at 90 degrees; hour hand at 3 x 30 + 15 x 0.5 = 97.5 degrees. Difference 7.5.',
  },

  // ---------------------------------------------------------------- level 7
  {
    id: 'q31',
    difficulty: 7,
    category: 'comprehension',
    question: `Read the passage and answer the question.

"The committee's report praised the pilot programme for cutting waiting times by 40%, but noted that the reduction was measured only at the three sites where additional staff had been hired. The report recommended extending the programme nationwide, while cautioning that its conclusions rested on a sample that had not been chosen at random."

Which of the following is the report's stated reason for caution? Answer with one letter only.
A) the programme proved too expensive to extend
B) the three sites were not randomly selected
C) waiting times were measured incorrectly
D) additional staff were never actually hired`,
    answer: 'B',
    note: 'The stated caution is that the sample was not chosen at random.',
  },
  {
    id: 'q32',
    difficulty: 7,
    category: 'maths',
    question:
      'How many trailing zeros are there in the decimal representation of 100 factorial?',
    answer: '24',
    note: 'floor(100/5) + floor(100/25) = 20 + 4 = 24.',
  },
  {
    id: 'q33',
    difficulty: 7,
    category: 'logic',
    question:
      'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How many cents does the ball cost?',
    answer: '5',
    note: 'ball = b, bat = b + 1.00, so 2b + 1.00 = 1.10, b = 0.05, i.e. 5 cents.',
  },
  {
    id: 'q34',
    difficulty: 7,
    category: 'maths',
    question: 'What is the sum of all prime numbers less than 20?',
    answer: '77',
    note: '2 + 3 + 5 + 7 + 11 + 13 + 17 + 19 = 77.',
  },
  {
    id: 'q35',
    difficulty: 7,
    category: 'logic',
    question:
      'If today is Wednesday, what day of the week will it be 100 days from today?',
    answer: 'Friday',
    note: '100 mod 7 = 2, and Wednesday plus two days is Friday.',
  },

  // ---------------------------------------------------------------- level 8
  {
    id: 'q36',
    difficulty: 8,
    category: 'logic',
    question: `Four friends — Ana, Ben, Cara and Dan — sit in a row of four seats numbered 1 to 4 from left to right.

- Ana sits at one of the two end seats.
- Ben sits immediately to the right of Cara.
- Dan does not sit next to Ana.

Who sits in seat 2? Answer with just the name.`,
    answer: 'Cara',
    note: 'Only two arrangements satisfy every constraint: Ana-Cara-Ben-Dan and Dan-Cara-Ben-Ana. In both, seat 2 is Cara.',
  },
  {
    id: 'q37',
    difficulty: 8,
    category: 'comprehension',
    question: `Read the passage and answer the question.

"Economists studying the oil shocks of the 1970s long assumed that price spikes, rather than physical supply interruptions, drove the recessions that followed. A 2019 reanalysis of refinery-level data found that output fell most sharply in regions where crude allocation, not price, was the binding constraint. The authors do not claim that prices were irrelevant; they argue only that the causal weight usually assigned to them has been overstated."

Which statement best captures the authors' claim? Answer with one letter only.
A) prices were irrelevant to the recessions
B) allocation constraints mattered more than is usually credited
C) the 1970s recessions were unrelated to oil
D) refinery-level data is unreliable`,
    answer: 'B',
    note: 'The authors explicitly stop short of saying prices were irrelevant; their claim is that allocation constraints were underweighted.',
  },
  {
    id: 'q38',
    difficulty: 8,
    category: 'maths',
    question:
      'How many distinct arrangements are there of the letters of the word BANANA?',
    answer: '60',
    note: '6! / (3! x 2!) = 720 / 12 = 60.',
  },
  {
    id: 'q39',
    difficulty: 8,
    category: 'maths',
    question:
      'A jar contains 3 red marbles and 4 blue marbles. Two marbles are drawn at random without replacement. What is the probability that both are red? Give the answer as a fraction in lowest terms.',
    answer: '1/7',
    note: '(3/7) x (2/6) = 6/42 = 1/7.',
  },
  {
    id: 'q40',
    difficulty: 8,
    category: 'maths',
    question: 'What is the value of 7! divided by 5! ?',
    answer: '42',
    note: '7! / 5! = 7 x 6 = 42.',
  },

  // ---------------------------------------------------------------- level 9
  {
    id: 'q41',
    difficulty: 9,
    category: 'logic',
    question: `On an island, every inhabitant is either a knight, who always tells the truth, or a knave, who always lies.

You meet two inhabitants, P and Q. P says: "We are both knaves."

Is Q a knight or a knave? Answer with one word.`,
    answer: 'knight',
    note: 'If P were a knight the statement would be true, making P a knave — a contradiction, so P is a knave and the statement is false. Since P is a knave, Q must be a knight.',
  },
  {
    id: 'q42',
    difficulty: 9,
    category: 'comprehension',
    question: `Read the passage and answer the question.

"The archive's cataloguers had for decades described the collection as complete. The claim rested on a count of bound volumes, and bound volumes were what the 1901 accession list recorded. When the library began digitising, staff found 340 loose folios stored in the same crates, unlisted because they had never been bound. The cataloguers' error was not carelessness; it was a category mistake inherited from the accession list itself."

According to the passage, why did the cataloguers describe the collection as complete? Answer with one letter only.
A) they had personally verified every item in the crates
B) they treated the collection as equivalent to its bound volumes
C) the loose folios had been deliberately concealed
D) the 1901 accession list had been lost`,
    answer: 'B',
    note: 'The passage says the claim rested on a count of bound volumes, and calls the error a category mistake inherited from the list.',
  },
  {
    id: 'q43',
    difficulty: 9,
    category: 'maths',
    question:
      'How many integers from 1 to 1000 inclusive are divisible by neither 3 nor 5?',
    answer: '533',
    note: '1000 - 333 - 200 + 66 = 533, by inclusion-exclusion.',
  },
  {
    id: 'q44',
    difficulty: 9,
    category: 'maths',
    question: 'What is the remainder when 3^100 is divided by 7?',
    answer: '4',
    note: '3^6 = 1 mod 7 and 100 = 6 x 16 + 4, so 3^100 = 3^4 = 81 = 4 mod 7.',
  },
  {
    id: 'q45',
    difficulty: 9,
    category: 'logic',
    question: `A four-digit number N has all of the following properties:

- all four of its digits are distinct;
- the sum of its digits is 18;
- its first digit is exactly twice its last digit;
- it is divisible by 9.

What is the smallest such number?`,
    answer: '2691',
    note: 'The last digit d gives first digit 2d, so d is 1, 2, 3 or 4. With d = 1 the middle two digits must sum to 15, and the smallest leading pair is 6 and 9, giving 2691. Larger d give larger numbers.',
  },

  // --------------------------------------------------------------- level 10
  {
    id: 'q46',
    difficulty: 10,
    category: 'maths',
    question:
      'Two workers, X and Y, can complete a job together in 12 days. Working alone, X would take 10 days longer than Y. How many days would Y take working alone?',
    answer: '20',
    note: 'With Y = y days and X = y + 10: 1/y + 1/(y+10) = 1/12 gives y^2 - 14y - 120 = 0, so y = 20 (X takes 30). Check: 1/20 + 1/30 = 1/12.',
  },
  {
    id: 'q47',
    difficulty: 10,
    category: 'comprehension',
    question: `Read the passage and answer the question.

"Critics of the standard model of language acquisition point out that children hear a finite and rather untidy sample of speech, yet converge on a grammar that is far more systematic than that sample. Nativists read this as evidence of an innate language faculty. Statistical learners reply that the sample is not as untidy as it appears: distributional regularities in child-directed speech are rich enough, they argue, to support the generalisations children actually make. Both sides agree the outcome is systematic; they disagree about what the systematicity is evidence for."

Which statement is supported by the passage? Answer with one letter only.
A) statistical learners deny that children's grammars are systematic
B) nativists and statistical learners disagree about the interpretation of the same observation
C) child-directed speech is agreed to be too untidy to learn from
D) nativists believe children hear an infinite sample of speech`,
    answer: 'B',
    note: 'The passage states both sides agree the outcome is systematic and disagree only about what that systematicity is evidence for.',
  },
  {
    id: 'q48',
    difficulty: 10,
    category: 'maths',
    question:
      'How many ways are there to tile a 2 by 10 rectangle completely with 1 by 2 dominoes?',
    answer: '89',
    note: 'Tilings of a 2 x n board follow the Fibonacci numbers with T(n) = F(n+1); T(10) = F(11) = 89.',
  },
  {
    id: 'q49',
    difficulty: 10,
    category: 'maths',
    question:
      'A fair coin is flipped 6 times. What is the probability of getting exactly 3 heads? Give the answer as a fraction in lowest terms.',
    answer: '5/16',
    note: 'C(6,3) / 2^6 = 20/64 = 5/16.',
  },
  {
    id: 'q50',
    difficulty: 10,
    category: 'logic',
    question:
      'You have 12 coins that look identical. Exactly one is counterfeit and has a different weight from the others, but you do not know whether it is heavier or lighter. Using a balance scale, what is the minimum number of weighings that is guaranteed to identify the counterfeit coin and determine whether it is heavier or lighter?',
    answer: '3',
    note: 'Each weighing has three outcomes, so 3 weighings distinguish at most 27 cases; the 24 cases (12 coins x 2 directions) fit, and 2 weighings (9 outcomes) cannot. Three is achievable.',
  },
];

/** Difficulty levels present in the bank, ascending. */
export const DIFFICULTIES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const QUESTIONS_PER_DIFFICULTY = 5;

export function getQuestion(id: string): Question | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}

export function questionsAtDifficulty(d: number): Question[] {
  return QUESTION_BANK.filter((q) => q.difficulty === d);
}

/** Structural self-check, used by the verification script. */
export function validateBank(): string[] {
  const problems: string[] = [];
  if (QUESTION_BANK.length !== 50) {
    problems.push(`expected 50 questions, found ${QUESTION_BANK.length}`);
  }
  const ids = new Set<string>();
  for (const q of QUESTION_BANK) {
    if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`);
    ids.add(q.id);
    if (q.difficulty < 1 || q.difficulty > 10) {
      problems.push(`${q.id} has difficulty ${q.difficulty} outside 1-10`);
    }
    if (!q.answer.trim()) problems.push(`${q.id} has an empty stored answer`);
  }
  for (const d of DIFFICULTIES) {
    const n = questionsAtDifficulty(d).length;
    if (n !== QUESTIONS_PER_DIFFICULTY) {
      problems.push(`difficulty ${d} has ${n} questions, expected ${QUESTIONS_PER_DIFFICULTY}`);
    }
  }
  return problems;
}