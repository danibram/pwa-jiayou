import { useRouter } from "next/router";
import useSWR from "swr";
import Loader from "../components/Loader";

let SYMBOL = ",";
const processLine = (line: string): string[] => {
  if (line.indexOf('"') < 0) return line.split(SYMBOL);

  let result = [],
    char = "",
    cell = "",
    quote = false;

  for (let i = 0; i < line.length; i++) {
    char = line[i];
    if (char == '"' && line[i + 1] == '"') {
      cell += char;
      i++;
    } else if (char == '"') {
      quote = !quote;
    } else if (!quote && char == SYMBOL) {
      result.push(cell);
      cell = "";
    } else {
      cell += char;
    }
    if (i == line.length - 1 && cell) {
      result.push(cell);
    }
  }
  return result;
};

const getCards = async (key) => {
  let id =
    "2PACX-1vSo70F6qxJdm5rvi4b-kWAYJncelMm0FSNlbWUceLBlPmiGKNOTozo81LHcTq1l2FGr6bRs3WCdf4Ss";
  let response = await fetch(
    `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`
  );

  let text = await response.text();

  if (response.status !== 200) {
    return null;
  }

  let [_, data] = text
    .split("\n")
    .map(processLine)
    .filter(Boolean)
    .reduce(
      ([head, data], a, index) => {
        if (index === 0) {
          return [a, []];
        } else {
          let newLinedata = head.reduce((acc, value, index) => {
            acc[value] = a[index];
            return acc;
          }, {});

          return [head, [...data, newLinedata]];
        }
      },
      [[], []]
    );

  return data;
};

export const withCards = (Component: any) => (props) => {
  const router = useRouter();

  const { data, revalidate } = useSWR("cards", getCards);

  if (!data) {
    return <Loader />;
  }

  return <Component {...props} cards={data} />;
};

export default withCards;
