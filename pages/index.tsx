import { Grid, makeStyles, Typography } from "@material-ui/core";
import clsx from "clsx";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import Layout from "../src/components/Layout";
import General from "../src/content/General.mdx";
import { MdxTagParse } from "../src/lib/md/mdParse";

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
    <>
      <Head>
        <title>加油 - Bienvenid@</title>
        <meta name="description" content="Bienvenido a Jiāyóu" />
      </Head>
      <Layout>
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
            <a href="https://dbr.io/" rel="noopener noreferrer" target="_blank">
              Dani
            </a>
          </Typography>
        </Grid>
      </Layout>
    </>
  );
};

export default Index;
