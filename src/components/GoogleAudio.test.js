import 'jest-environment-jsdom-global';

jest.mock('@tensorflow-models/speech-commands', () => {
    const originalModule = jest.requireActual('@tensorflow-models/speech-commands');

    const createMock = jest.fn(() => {
        return {
            ensureModelLoaded: jest.fn(),
            listen: jest.fn(),
            // Add other necessary methods or properties you use in your component
        };
    });

    return {
        ...originalModule,
        create: createMock,
    };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleAudio from './GoogleAudio.jsx';

describe('GoogleAudio component', () => {
    it('start prediction button is displayed', () => {
        render(<GoogleAudio />);
        const buttonElement = screen.getByText(/Start Prediction/i);
        expect(buttonElement).toBeInTheDocument();
    });




});
