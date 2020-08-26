import MaterialCard from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import React from "react";
import { visualizations } from "../lib/options";

const useStyles = makeStyles({
    root: {
        width: "90vw",
        textAlign: "center",
    },
    cardMedia: {
        objectFit: "cover",
        objectPosition: "top",
        userSelect: "none",
        pointerEvents: "none",
    },
    text: {
        fontSize: "calc(100px + (26 - 100) * ((100vw - 300px) / (1600 - 300)))",
    },
    textSolution1: {
        fontSize: "calc(30px + (26 - 30) * ((100vw - 300px) / (1600 - 300)))",
    },
    textSolution: {
        fontSize: "calc(20px + (26 - 20) * ((100vw - 300px) / (1600 - 300)))",
    },
});

export default function Card({ item }) {
    const classes = useStyles();
    const [back, setBack] = React.useState(false);

    const visualization =
        localStorage.getItem("Settings_visualization") ||
        visualizations.hanzipinyinfirst;

    console.log(item);
    return (
        <MaterialCard className={classes.root} onClick={() => setBack(!back)}>
            {/* <CardActionArea> */}
            {/* <CardMedia
                    className={classes.cardMedia}
                    component="img"
                    height="250"
                    image={url}
                /> */}
            <CardContent>
                {visualization === visualizations.hanzifirst ? (
                    !back ? (
                        <>
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[0]}
                            </Typography>
                            <br />
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[1]}
                            </Typography>
                        </>
                    ) : (
                        <Typography
                            variant="body1"
                            component="h3"
                            className={classes.textSolution}
                        >
                            {item[2].content && item[2].content.$t}
                        </Typography>
                    )
                ) : visualization === visualizations.pinyinfirst ? (
                    !back ? (
                        <Typography
                            variant="h6"
                            component="h3"
                            className={classes.text}
                        >
                            {item[1].content.$t}
                        </Typography>
                    ) : (
                        <>
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[0]}
                            </Typography>
                            <br />
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[1]}
                            </Typography>
                            <br />
                            <Typography
                                variant="body1"
                                component="h3"
                                className={classes.textSolution}
                            >
                                {item[2].content && item[2].content.$t}
                            </Typography>
                        </>
                    )
                ) : visualization === visualizations.hanzipinyinfirst ? (
                    !back ? (
                        <>
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[0]}
                            </Typography>
                            <br />
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.textSolution1}
                            >
                                {item[1].content && item[1].content.$t}
                            </Typography>
                            <br />
                            <Typography
                                variant="h6"
                                component="h3"
                                className={classes.text}
                            >
                                {item[0].content.$t.split(" | ")[1]}
                            </Typography>
                        </>
                    ) : (
                        <Typography
                            variant="body1"
                            component="h3"
                            className={classes.textSolution}
                        >
                            {item[2].content && item[2].content.$t}
                        </Typography>
                    )
                ) : !back ? (
                    <Typography
                        variant="body1"
                        component="h3"
                        className={classes.textSolution}
                    >
                        {item[2].content && item[2].content.$t}
                    </Typography>
                ) : (
                    <>
                        <Typography
                            variant="h6"
                            component="h3"
                            className={classes.text}
                        >
                            {item[0].content.$t.split(" | ")[0]}
                        </Typography>
                        <br />
                        <Typography
                            variant="h6"
                            component="h3"
                            className={classes.textSolution1}
                        >
                            {item[1].content && item[1].content.$t}
                        </Typography>
                        <br />
                        <Typography
                            variant="h6"
                            component="h3"
                            className={classes.text}
                        >
                            {item[0].content.$t.split(" | ")[1]}
                        </Typography>
                    </>
                )}
            </CardContent>
            {/* </CardActionArea> */}
        </MaterialCard>
    );
}
