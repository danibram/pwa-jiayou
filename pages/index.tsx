import { Grid, makeStyles, Typography } from "@material-ui/core";
import clsx from "clsx";
import dayjs from "dayjs";
import * as utc from "dayjs/plugin/utc";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import Layout from "../src/components/Layout2";
import { MdxTagParse } from "../src/helpers/mdParse";
import General from "../src/mdx/General.mdx";
dayjs.extend(utc);

// const useStyles = makeStyles((theme) => ({
//     margin: {
//         margin: theme.spacing(1),
//     },
//     extendedIcon: {
//         marginRight: theme.spacing(1),
//     },
//     fab: {
//         position: "fixed",
//         bottom: theme.spacing(4),
//         right: theme.spacing(4),
//         zIndex: 999,
//     },
// }));

const useStyles = makeStyles((theme) => ({
    root: {
        position: "fixed",
        bottom: 0,
        width: "100%",
    },
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
}));

const Index = () => {
    const classes = useStyles();
    const router = useRouter();
    const [value, setValue] = React.useState("/");

    const handleChange = (event, newValue) => {
        setValue(newValue);
    };

    return (
        <Layout>
            <Head>
                <title>Bienvenido a 加油</title>
                <meta name="description" content="Bienvenido a Jiayou" />
            </Head>

            <MdxTagParse>
                <General />
            </MdxTagParse>

            <Grid
                item
                xs={12}
                className={clsx(classes.marginTop2, classes.centerContent)}
            >
                <Typography variant="body1">
                    {"Made with "}
                    <span role="img" aria-label="github">
                        ❤️
                    </span>
                    {" by "}
                    <a href="" rel="noopener noreferrer" target="_blank">
                        Laura
                    </a>
                    {" & "}
                    <a
                        href="https://dbr.io/"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        Dani
                    </a>
                </Typography>
            </Grid>
        </Layout>
    );
};

export default Index;
