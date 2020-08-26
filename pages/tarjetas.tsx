import {
    Box,
    Button,
    ButtonGroup,
    Grid,
    makeStyles,
    Typography,
} from "@material-ui/core";
import clsx from "clsx";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { direction, Swipeable } from "react-deck-swiper";
import useSWR from "swr";
import Card2 from "../src/components/Card";
import CardButtons from "../src/components/CardButtons";
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
    data.splice(0, 4);

    console.log(data[0]);

    let arrays = [];
    let size = 4;

    while (data.length > 0) arrays.push(data.splice(0, size));

    console.log(arrays[0]);

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

    const [lastSwipeDirection, setLastSwipeDirection] = React.useState(null);
    const [cards, setCards] = React.useState(cardsSrv);
    const [index, setIndex] = React.useState(0);

    const handleOnSwipe = (swipeDirection) => {
        if (swipeDirection === direction.RIGHT) {
            setLastSwipeDirection("your right");
            setIndex(index - 1 < 0 ? cards.length - 1 : index - 1);
        }

        if (swipeDirection === direction.LEFT) {
            setLastSwipeDirection("your left");
            setIndex(index + 1 > cards.length - 1 ? 0 : index + 1);
        }
    };

    const renderButtons = ({ right, left }) => (
        <CardButtons right={right} left={left} />
    );

    return (
        <>
            <Head>
                <title>加油 - Tarjetas</title>
            </Head>
            <Layout>
                <Head>
                    <title>HSK1</title>
                    <meta name="description" content="Bienvenido a Jiāyóu" />
                </Head>
                <Box>
                    <Grid
                        container
                        spacing={3}
                        className={classes.centerContent}
                    >
                        {/* <Grid
                        item
                        xs={12}
                        className={clsx(
                            classes.marginTop2,
                            classes.centerContent
                        )}
                    >
                        <Typography variant="h5">HSK 1 Vocabulary</Typography>
                    </Grid> */}

                        {/* {cards.length > 0 && (
                    <Grid
                        item
                        xs={12}
                        className={clsx(
                            classes.marginTop2,
                            classes.centerContent
                        )}
                    >
                        {lastSwipeDirection ? (
                            <Typography variant="body1">
                                {"Looks like you have just swiped to "}
                                {lastSwipeDirection}? 🔮
                            </Typography>
                        ) : (
                            <Typography variant="body1">
                                Try swiping the card below!
                            </Typography>
                        )}
                    </Grid>
                )} */}

                        <Grid
                            item
                            xs={12}
                            className={clsx(
                                classes.marginTop1,
                                classes.centerContent
                            )}
                        >
                            <Swipeable onSwipe={handleOnSwipe}>
                                <Card2 item={cards[index]} />
                            </Swipeable>
                        </Grid>

                        <Grid
                            item
                            xs={12}
                            className={clsx(classes.marginTop1, classes.flex)}
                        >
                            <ButtonGroup
                                color="primary"
                                aria-label="outlined primary button group"
                            >
                                <Button
                                    onClick={() =>
                                        handleOnSwipe(direction.RIGHT)
                                    }
                                >
                                    {"<"}
                                </Button>
                                <Button
                                    onClick={() =>
                                        handleOnSwipe(direction.LEFT)
                                    }
                                >
                                    {">"}
                                </Button>
                            </ButtonGroup>
                            <Typography variant="body1">
                                {`${index + 1} / ${cards.length}`}
                            </Typography>

                            <a
                                href={`plecoapi://x-callback-url/s?q=${
                                    cards[index][0].content.$t.split(" | ")[0]
                                }`}
                            >
                                Open in pleco
                            </a>
                        </Grid>
                    </Grid>
                </Box>
            </Layout>
        </>
    );
};

export default withCards(Index);
