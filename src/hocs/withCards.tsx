import { useRouter } from "next/router";
import React from "react";
import useSWR from "swr";
import Loader from "../components/Loader";

const getCards = async (key) => {
  let id = "1EsJtYYTWM4XDIG7e5FvxMQCEPQ8M_bkDW7FSDXPupD4";
  let response = await fetch(`https://opensheet.elk.sh/${id}/1`);

  let result = await response.json();

  if (response.status !== 200) {
    return null;
  }

  return result;
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
