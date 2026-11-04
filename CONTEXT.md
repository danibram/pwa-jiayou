# 加油 · Hanzi HSK

Purpose: a phone-first PWA where a Spanish-speaking learner picks one or several HSK levels, or one topic, and learns and reviews Chinese vocabulary (words), with each word's characters and strokes one tap away, so each day they know what to study and can see it stick.

Jobs the app must do well:

1. Choose what to study: one or several lists for the daily session, or one topic to practise on its own. A list is a set of words: HSK 1 to 6 and Extra (words outside HSK), all curated in the content editor (`editor/`) and shipped with app releases. Learners do not add words. A word has one progress whichever lists bring it. Ticking a list downloads the strokes its words use, including characters from other levels and, for Extra words outside HSK, from the CDN.
2. Learn new words (meaning, pinyin, audio, examples).
3. From a word, open each character: meaning, radical, other words with it.
4. Watch and write a word's characters stroke by stroke.
5. Review what is due today, quickly, with honest grading.
6. See progress: what is mastered, what is weak, streak.

The judged viewport is a phone in portrait (~390px). Desktop is a secondary check.
