import { AppBar, makeStyles, Toolbar, Typography } from "@material-ui/core";
import BottomNavigation from "@material-ui/core/BottomNavigation";
import BottomNavigationAction from "@material-ui/core/BottomNavigationAction";
import BookmarksIcon from "@material-ui/icons/Bookmarks";
import RestoreIcon from "@material-ui/icons/Home";
import SettingsIcon from "@material-ui/icons/Settings";
import dayjs from "dayjs";
import * as utc from "dayjs/plugin/utc";
import { useRouter } from "next/router";
import React from "react";
dayjs.extend(utc);

const useStyles = makeStyles({
    root: {
        position: "fixed",
        height: "100%",
        width: "100%",
    },
    nav: {
        position: "fixed",
        bottom: 0,
        width: "100%",
    },
    title: {
        flexGrow: 1,
    },
});

const Layout = ({ children }) => {
    const classes = useStyles();
    const router = useRouter();
    const [value, setValue] = React.useState(window.location.pathname);

    const handleChange = (event, newValue) => {
        router.push(newValue);
        setValue(newValue);
    };

    return (
        <div className={classes.root}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" className={classes.title}>
                        加油
                    </Typography>
                </Toolbar>
            </AppBar>
            {children}
            <BottomNavigation
                value={value}
                onChange={handleChange}
                className={classes.nav}
            >
                <BottomNavigationAction
                    label="Inicio"
                    value="/"
                    icon={<RestoreIcon />}
                />
                <BottomNavigationAction
                    label="Cards"
                    value="/cards"
                    icon={<BookmarksIcon />}
                />
                <BottomNavigationAction
                    label="Settings"
                    value="/settings"
                    icon={<SettingsIcon />}
                />
            </BottomNavigation>
        </div>
    );
};

export default Layout;
