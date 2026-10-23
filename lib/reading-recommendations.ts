export type ReadingRecommendation = {
  title: string;
  author: string;
  year: number;
  category: string;
  isbn: string;
  summary: string;
  url: string;
};

// Winner details and full summaries: National Book Foundation; covers: Open Library by ISBN.
export const READING_RECOMMENDATIONS: readonly ReadingRecommendation[] = [
  {
    title: 'James', author: 'Percival Everett', year: 2024, category: 'Fiction', isbn: '9780385550369',
    summary: 'Jim takes the lead in a reimagining of Huckleberry Finn and the search for freedom.',
    url: 'https://www.nationalbook.org/books/james/',
  },
  {
    title: 'Interior Chinatown', author: 'Charles Yu', year: 2020, category: 'Fiction', isbn: '9780307907196',
    summary: 'An aspiring actor challenges the stereotyped roles assigned to him, on screen and in life.',
    url: 'https://www.nationalbook.org/books/interior-chinatown/',
  },
  {
    title: 'The Friend', author: 'Sigrid Nunez', year: 2018, category: 'Fiction', isbn: '9780735219458',
    summary: 'A writer inherits a Great Dane and finds unexpected companionship while grieving a friend.',
    url: 'https://www.nationalbook.org/books/the-friend/',
  },
  {
    title: 'The Good Lord Bird', author: 'James McBride', year: 2013, category: 'Fiction', isbn: '9781594486340',
    summary: 'A young enslaved boy joins abolitionist John Brown in a sharply comic historical adventure.',
    url: 'https://www.nationalbook.org/books/the-good-lord-bird/',
  },
  {
    title: 'The Echo Maker', author: 'Richard Powers', year: 2006, category: 'Fiction', isbn: '9780312426439',
    summary: 'After an accident, a man no longer recognizes his sister, unsettling their ideas of identity.',
    url: 'https://www.nationalbook.org/books/the-echo-maker/',
  },
  {
    title: 'Between the World and Me', author: 'Ta-Nehisi Coates', year: 2015, category: 'Nonfiction', isbn: '9780812993547',
    summary: 'A father writes to his son about race, history, and growing up Black in America.',
    url: 'https://www.nationalbook.org/books/between-the-world-and-me/',
  },
  {
    title: 'Just Kids', author: 'Patti Smith', year: 2010, category: 'Nonfiction', isbn: '9780060936228',
    summary: 'Patti Smith recalls her friendship with Robert Mapplethorpe and their early artistic lives.',
    url: 'https://www.nationalbook.org/books/just-kids/',
  },
  {
    title: 'The Poet X', author: 'Elizabeth Acevedo', year: 2018, category: "Young People's Literature", isbn: '9780062662804',
    summary: 'A Harlem teenager discovers slam poetry as a way to make her own voice heard.',
    url: 'https://www.nationalbook.org/books/the-poet-x/',
  },
  {
    title: 'Brown Girl Dreaming', author: 'Jacqueline Woodson', year: 2014, category: "Young People's Literature", isbn: '9780399252518',
    summary: 'A memoir in verse follows a childhood in South Carolina and New York during the civil rights era.',
    url: 'https://www.nationalbook.org/books/brown-girl-dreaming/',
  },
];

export function pickReadingRecommendation(random = Math.random): ReadingRecommendation {
  return READING_RECOMMENDATIONS[Math.floor(random() * READING_RECOMMENDATIONS.length)];
}

export function getBookCoverUrl(book: ReadingRecommendation) {
  return `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`;
}
