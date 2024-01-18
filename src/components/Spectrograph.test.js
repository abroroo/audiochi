import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Spectrogram from './Spectrograph';

describe('Spectrogram component', () => {


    it('renders without crashing', () => {
        render(<Spectrogram />);
        // Ensure the component renders without errors
        expect(screen.getByText(/Sound Recognition/i)).toBeInTheDocument();
    });

    it('initializes with microphone off', () => {
        render(<Spectrogram />);
        // Ensure the "Visualize Audio" button is present
        const visualizeButton = screen.getByRole('button', { name: /Visualize Audio/i });
        expect(visualizeButton).toBeInTheDocument();

        // Ensure the GoogleAudio component is rendered
        const googleAudioElement = screen.getByRole('button', { name: /Start Prediction/i });
        expect(googleAudioElement).toBeInTheDocument();
    });

});
