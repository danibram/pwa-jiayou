import AppBar from "@material-ui/core/AppBar";
import Divider from "@material-ui/core/Divider";
import Drawer from "@material-ui/core/Drawer";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import BookmarksIcon from "@material-ui/icons/Bookmarks";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import GetAppIcon from "@material-ui/icons/GetApp";
import RestoreIcon from "@material-ui/icons/Home";
import MenuIcon from "@material-ui/icons/Menu";
import SettingsIcon from "@material-ui/icons/Settings";
import clsx from "clsx";
import { useRouter } from "next/router";
import React from "react";
import { withA2HS } from "../Providers/a2hs";

const drawerWidth = 240;

const useStyles = makeStyles((theme) => ({
    root: {
        display: "flex",
        position: "fixed",
        height: "100%",
        width: "100%",
    },
    appBar: {
        transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
    appBarShift: {
        width: `calc(100% - ${drawerWidth}px)`,
        marginLeft: drawerWidth,
        transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
    },
    menuButton: {
        marginRight: theme.spacing(2),
    },
    hide: {
        display: "none",
    },
    drawer: {
        width: drawerWidth,
        flexShrink: 0,
    },
    drawerPaper: {
        width: drawerWidth,
    },
    drawerHeader: {
        display: "flex",
        alignItems: "center",
        padding: theme.spacing(0, 1),
        // necessary for content to be below app bar
        ...theme.mixins.toolbar,
        justifyContent: "flex-end",
    },
    content: {
        flexGrow: 1,
        padding: theme.spacing(1),
        transition: theme.transitions.create("margin", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
        marginLeft: -drawerWidth,
    },
    contentShift: {
        transition: theme.transitions.create("margin", {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
        marginLeft: 0,
    },
    icons: {
        fontSize: 36,
    },
    title: {
        flexGrow: 1,
    },
}));

const Layout = ({
    children,
    isAppInstallable,
    isAppInstalled,
    deferredPrompt,
}) => {
    const classes = useStyles();
    const theme = useTheme();
    const router = useRouter();

    const [open, setOpen] = React.useState(false);

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    return (
        <div className={classes.root}>
            <AppBar
                position="fixed"
                className={clsx(classes.appBar, {
                    [classes.appBarShift]: open,
                })}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerOpen}
                        edge="start"
                        className={clsx(
                            classes.menuButton,
                            open && classes.hide
                        )}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap className={classes.title}>
                        加油
                    </Typography>
                    {isAppInstallable && !isAppInstalled ? (
                        <div>
                            <IconButton
                                edge="end"
                                aria-label="account of current user"
                                onClick={() => deferredPrompt.prompt()}
                            >
                                <GetAppIcon style={{ color: "white" }} />
                            </IconButton>
                        </div>
                    ) : null}
                </Toolbar>
            </AppBar>
            <Drawer
                className={classes.drawer}
                variant="persistent"
                anchor="left"
                open={open}
                classes={{
                    paper: classes.drawerPaper,
                }}
            >
                <div className={classes.drawerHeader}>
                    <IconButton onClick={handleDrawerClose}>
                        {theme.direction === "ltr" ? (
                            <ChevronLeftIcon />
                        ) : (
                            <ChevronRightIcon />
                        )}
                    </IconButton>
                </div>
                <Divider />
                <List>
                    <ListItem
                        button
                        key={"inicio"}
                        onClick={(event) => router.push("/")}
                    >
                        <ListItemIcon>
                            <RestoreIcon />
                        </ListItemIcon>
                        <ListItemText primary={"Inicio"} />
                    </ListItem>
                    <ListItem
                        button
                        key={"cards"}
                        onClick={(event) => router.push("/tarjetas")}
                    >
                        <ListItemIcon>
                            <BookmarksIcon />
                        </ListItemIcon>
                        <ListItemText primary={"Cards"} />
                    </ListItem>
                    <ListItem
                        button
                        key={"configuracion"}
                        onClick={(event) => router.push("/opciones")}
                    >
                        <ListItemIcon>
                            <SettingsIcon />
                        </ListItemIcon>
                        <ListItemText primary={"Configuracion"} />
                    </ListItem>
                </List>
                <Divider />
                <List>
                    {isAppInstallable && !isAppInstalled ? (
                        <ListItem
                            button
                            key={"configuracion"}
                            onClick={(event) => deferredPrompt.prompt()}
                        >
                            <ListItemIcon>
                                <GetAppIcon />
                            </ListItemIcon>
                            <ListItemText primary={"Descarga la app"} />
                        </ListItem>
                    ) : null}
                </List>
            </Drawer>
            <main
                className={clsx(classes.content, {
                    [classes.contentShift]: open,
                })}
            >
                <div className={classes.drawerHeader} />
                {children}
            </main>
        </div>
    );
};

export default withA2HS(Layout);
