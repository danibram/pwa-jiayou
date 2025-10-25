import { Component, createSignal, Show } from 'solid-js';
import FeedbackButton from './components/FeedbackButton';
import Entrenamiento from './pages/Entrenamiento';
import Home from './pages/Home';
import Tarjetas from './pages/Tarjetas';

type Page = 'home' | 'tarjetas' | 'entrenamiento';

const App: Component = () => {
    const [currentPage, setCurrentPage] = createSignal<Page>('home');

    const handleNavigate = (page: Page) => {
        setCurrentPage(page);
    };

    const handleGoHome = () => {
        setCurrentPage('home');
    };

    return (
        <div class="app overflow-x-hidden w-full max-w-full">
            <Show when={currentPage() === 'home'}>
                <Home onNavigate={handleNavigate} />
            </Show>

            <Show when={currentPage() === 'tarjetas'}>
                <Tarjetas onGoHome={handleGoHome} />
            </Show>

            <Show when={currentPage() === 'entrenamiento'}>
                <Entrenamiento onGoHome={handleGoHome} />
            </Show>

            {/* Floating feedback button - visible on all pages */}
            <FeedbackButton />
        </div>
    );
};

export default App;

