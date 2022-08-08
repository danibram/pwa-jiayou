import React, { useState } from "react";

export const Context = React.createContext(null);

const initialState: any = {
  deferredPrompt: () => {},
  isAppInstallable: false,
  isAppInstalled: false,
};

const Provider = ({ children }) => {
  const [state, setA2HSState] = useState(initialState);

  window.addEventListener("beforeinstallprompt", (e) => {
    console.log("beforeinstallprompt");
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    setA2HSState({ deferredPrompt: e, isAppInstallable: true });
  });

  window.addEventListener("appinstalled", (evt) => {
    setA2HSState({ isAppInstalled: true });
  });

  return (
    <Context.Provider value={{ ...state, setA2HSState }}>
      {children}
    </Context.Provider>
  );
};

export const withA2HS = (Component) => {
  const ChildComponent = (props) => {
    return (
      <Context.Consumer>
        {(contextProps) => {
          return <Component {...contextProps} {...props} />;
        }}
      </Context.Consumer>
    );
  };

  return ChildComponent;
};

export default Provider;
