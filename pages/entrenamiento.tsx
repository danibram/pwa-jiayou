import {
    BottomNavigation,
    BottomNavigationAction,
    Box,
    Fab,
    Grid,
    makeStyles,
    Typography,
} from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import SyncIcon from "@material-ui/icons/Sync";
import clsx from "clsx";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { Swipeable } from "react-deck-swiper";
import useSWR from "swr";
import Card2 from "../src/components/Card";
import Layout from "../src/components/Layout2";
import Loader from "../src/components/Loader";

const useStyles = makeStyles((theme) => ({
    centerContent: {
        justifyContent: "center",
        flexDirection: "column",
        alignItems: "center",
        display: "flex",
    },
    marginTop5: {
        marginTop: theme.spacing(5),
    },
    marginTop2: {
        marginTop: theme.spacing(2),
    },
    marginTop1: {
        marginTop: theme.spacing(1),
    },
    flex: {
        display: "flex",
        width: "90%",
        alignItems: "center",
        justifyContent: "space-evenly",
    },
    bottom: {
        position: "absolute",
        bottom: "0",
        width: "100%",
        boxShadow:
            "0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)",
    },
    centerText: {
        paddingTop: "16px",
    },
    fab: {
        position: "fixed",
        bottom: theme.spacing(10),
        right: theme.spacing(4),
        zIndex: 999,
    },
}));

const getCards = async (key) => {
    let id = "1VfbwFPzMWBW-agNmnrKJdli9OBfIvl_KfJzlpdNh7TY";
    let response = await fetch(
        `https://spreadsheets.google.com/feeds/cells/${id}/1/public/full?alt=json`
    );

    let result = await response.json();

    if (response.status !== 200) {
        return null;
    }

    if (!result.feed && !result.feed.entry) {
        return null;
    }

    let data = result.feed.entry;
    let size = 5;
    data.splice(0, size);

    console.log(data[0]);

    let arrays = [];

    while (data.length > 0) arrays.push(data.splice(0, size));

    return arrays;
};

export const withCards = (Component: any) => (props) => {
    const router = useRouter();

    const { data, revalidate } = useSWR("cards", getCards);

    if (!data) {
        return <Loader />;
    }

    return <Component {...props} cards={data} />;
};

const Index = ({ cards: cardsSrv }) => {
    const classes = useStyles();
    const router = useRouter();

    const [cards, setCards] = React.useState(cardsSrv);
    const [index, setIndex] = React.useState(0);
    const [count, setCount] = React.useState(1);

    const handleNext = () => {
        let newCards = cards;
        newCards.splice(index, 1);
        setCards(newCards);
        setCount(count + 1);
        let newLength = newCards.length;
        let newIndex = Math.floor(Math.random() * newLength);
        setIndex(newIndex);
    };

    return (
        <>
            <Head>
                <title>加油 - Tarjetas</title>
            </Head>
            <Layout>
                <Box>
                    <Grid
                        container
                        spacing={2}
                        className={classes.centerContent}
                    >
                        <Grid
                            item
                            xs={12}
                            className={clsx(
                                classes.marginTop2,
                                classes.centerContent
                            )}
                        >
                            <Swipeable onSwipe={handleNext} fadeThreshold={120}>
                                <Card2 item={cards[index]} />
                            </Swipeable>
                        </Grid>

                        <Fab
                            color="secondary"
                            aria-label="add"
                            className={classes.fab}
                            onClick={() => {
                                window.open(
                                    `plecoapi://x-callback-url/s?q=${
                                        cards[index][0].content.$t.split(
                                            " | "
                                        )[0]
                                    }`,
                                    "_blank"
                                );
                            }}
                        >
                            <SearchIcon />
                        </Fab>

                        <BottomNavigation className={clsx(classes.bottom)}>
                            <Typography
                                variant="body1"
                                className={clsx(classes.centerText)}
                            >
                                {`${count} / ${cards.length}`}
                            </Typography>
                            {/* <a
                                href={`plecoapi://x-callback-url/s?q=${
                                    cards[index][0].content.$t.split(" | ")[0]
                                }&x-source=Jiāyóu!`}
                            >
                                Open in pleco
                            </a> */}
                            <BottomNavigationAction
                                label="next"
                                icon={<SyncIcon />}
                                onClick={() => handleNext()}
                            />
                        </BottomNavigation>
                    </Grid>
                </Box>
            </Layout>
        </>
    );
};

export default withCards(Index);
