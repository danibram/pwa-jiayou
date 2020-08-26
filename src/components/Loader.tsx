import { Backdrop, CircularProgress, makeStyles } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
    backdrop: {
        zIndex: theme.zIndex.drawer + 1,
        color: theme.palette.primary.main
    }
}));

export default ({ open = true }) => {
    const classes = useStyles();

    open = open ? open : open === undefined ? true : false;

    return (
        <Backdrop className={classes.backdrop} open={open}>
            <CircularProgress color="secondary" />
        </Backdrop>
    );
};
