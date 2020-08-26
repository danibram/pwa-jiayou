import { Button, makeStyles } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import { useEffect, useState } from "react";

const useStyles = makeStyles((theme) => ({
    notification: {
        marginTop: theme.spacing(8),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
    },
}));

function getNotificationPermissionState() {
    if (navigator.permissions) {
        return navigator.permissions
            .query({ name: "notifications" })
            .then((result) => {
                return result.state;
            });
    }

    return new Promise((resolve) => {
        resolve(Notification.permission);
    });
}

function askPermissions() {
    return new Promise(function (resolve, reject) {
        const permissionResult = Notification.requestPermission(function (
            result
        ) {
            resolve(result);
        });

        if (permissionResult) {
            permissionResult.then(resolve, reject);
        }
    }).then(function (permissionResult) {
        if (permissionResult !== "granted") {
            throw new Error("We weren't granted permission.");
        }
    });
}

function urlB64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export const Notifications = ({ user, children }) => {
    const [notifications, setNotification] = useState(null);
    const classes = useStyles();

    const initNotifications = async (userId, force = false) => {
        let permissions = await getNotificationPermissionState();

        if (force === true) {
            permissions = await askPermissions();
        }

        if (permissions === "granted") {
            const serviceWorker = await navigator.serviceWorker.ready; // 1
            let subscription = await serviceWorker.pushManager.getSubscription();

            if (force === true) {
                let reg = await navigator.serviceWorker.getRegistration();

                var options = {
                    body: "Gracias por activar las notificaciones",
                    data: {
                        dateOfArrival: Date.now(),
                    },
                };

                await reg.showNotification("Genial!", options);

                console.log(`Sent notification`);
            }

            if (!subscription) {
                console.log("subscribing....");
                const push = await serviceWorker.pushManager.subscribe({
                    // 3
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(
                        "BG66vCCBj0MaeNZolYnf6KHcnnIxQv51EbnLnSyq068CihrpY-cTkjJFG-YQI_pbk8zPziGzkP0gvM8fSrN6dOY"
                    ),
                });

                console.log("subscribed. ", push.toJSON());

                //await API.sendPush(userId, push.toJSON());
            } else {
                console.log("subscribed. ", subscription.toJSON());
                //await subscription.unsubscribe();
                //await API.sendPush(userId, subscription.toJSON());
            }

            setNotification(null);
        } else if (permissions !== "denied") {
            setNotification(
                <>
                    'Si quieres recibir actulizaciones de medallas y puntos
                    debes activar las notificaciones'{" "}
                    <Button onClick={() => initNotifications(userId, true)}>
                        Habilitar Notificaciones
                    </Button>
                </>
            );
        }
    };

    useEffect(() => {
        if (
            typeof window !== "undefined" &&
            "serviceWorker" in navigator &&
            window.workbox !== undefined &&
            user
        ) {
            if ("PushManager" in window) {
                initNotifications(user.id);
            } else {
                setNotification(
                    <>
                        'Este navegador no es compatible con las notificaciones,
                        no podremos informarte cuando ganes medallas y puntos...
                        =('
                    </>
                );
            }
        }
    }, []);

    return (
        <>
            {notifications ? (
                <Alert className={classes.notification} severity="warning">
                    {notifications}
                </Alert>
            ) : null}

            {children}
        </>
    );
};

export const withNotifications = (Component: any) => (props) => {
    return (
        <Notifications user={props.user}>
            <Component {...props} />
        </Notifications>
    );
};
