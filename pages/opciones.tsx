import {
    FormControl,
    Grid,
    InputLabel,
    makeStyles,
    MenuItem,
    Select,
    Typography,
} from "@material-ui/core";
import dayjs from "dayjs";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import Layout from "../src/components/Layout2";
import { visualizations } from "../src/lib/options";
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);

const useStyles = makeStyles((theme) => ({
    margin: {
        margin: theme.spacing(1),
    },
    extendedIcon: {
        marginRight: theme.spacing(1),
    },
    fab: {
        position: "fixed",
        bottom: theme.spacing(4),
        right: theme.spacing(4),
        zIndex: 999,
    },
    formControl: {
        margin: theme.spacing(1),
        minWidth: 120,
    },
}));

const Index = () => {
    const classes = useStyles();
    const router = useRouter();

    const visualization =
        localStorage.getItem("Settings_visualization") ||
        visualizations.hanzipinyinfirst;
    const [visualizationState, setVisualization] = React.useState(
        visualization
    );

    return (
        <Layout>
            <Head>
                <title>HSK1</title>
                <meta name="description" content="Bienvenido a Jiayou" />
            </Head>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Typography variant="h5">Configuracion</Typography>
                </Grid>

                <FormControl className={classes.formControl}>
                    <InputLabel id="demo-simple-select-filled-label">
                        Visualizacion
                    </InputLabel>
                    <Select
                        labelId="demo-simple-select-filled-label"
                        id="demo-simple-select-filled"
                        value={visualizationState}
                        onChange={(event) => {
                            setVisualization(event.target.value);
                            localStorage.setItem(
                                "Settings_visualization",
                                event.target.value
                            );
                        }}
                    >
                        <MenuItem value={visualizations.hanzifirst}>
                            Primero Hanzi
                        </MenuItem>
                        <MenuItem value={visualizations.pinyinfirst}>
                            Primero Pinyin
                        </MenuItem>
                        <MenuItem value={visualizations.translationfirst}>
                            Primero Traduccion
                        </MenuItem>
                        <MenuItem value={visualizations.hanzipinyinfirst}>
                            Primero Hanzi+Pinyin
                        </MenuItem>
                    </Select>
                </FormControl>
            </Grid>
        </Layout>
    );
};

export default Index;
